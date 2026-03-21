import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../ai/index.js", () => ({
  callStoryteller: vi.fn(),
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: vi.fn(),
  getCampaignPremise: vi.fn(),
  getChatHistory: vi.fn(),
  getActiveCampaign: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  clamp: vi.fn((val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max)
  ),
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { callStoryteller } from "../../ai/index.js";
import {
  getActiveCampaign,
  getCampaignPremise,
  getChatHistory,
} from "../../campaign/index.js";
import { loadSettings } from "../../settings/index.js";
import { resolveRoleModel } from "../../ai/index.js";
import chatRoutes from "../chat.js";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetPremise = vi.mocked(getCampaignPremise);
const mockedGetHistory = vi.mocked(getChatHistory);
const mockedCallStoryteller = vi.mocked(callStoryteller);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRole = vi.mocked(resolveRoleModel);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/chat", chatRoutes);

const CAMPAIGN_ID = "campaign-42";

function activateCampaign() {
  mockedGetActive.mockReturnValue({
    id: CAMPAIGN_ID,
    name: "Test Campaign",
    createdAt: "2026-01-01",
  } as any);
}

function setupStoryteller() {
  mockedLoadSettings.mockReturnValue({
    storyteller: { providerId: "p1", model: "st-model", temperature: 0.7, maxTokens: 2048 },
    providers: [{ id: "p1", name: "P1", baseUrl: "http://localhost:1234", apiKey: "", defaultModel: "m", isBuiltin: false }],
  } as any);

  mockedResolveRole.mockReturnValue({
    provider: { baseUrl: "http://localhost:1234", apiKey: "", model: "st-model" },
    temperature: 0.7,
    maxTokens: 2048,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /chat/history
// ---------------------------------------------------------------------------
describe("GET /chat/history", () => {
  it("returns messages and premise", async () => {
    activateCampaign();
    mockedGetPremise.mockReturnValue("A dark fantasy world.");
    mockedGetHistory.mockReturnValue([
      { role: "user", content: "I look around." },
      { role: "assistant", content: "You see a forest." },
    ] as any);

    const res = await app.request("/chat/history");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.premise).toBe("A dark fantasy world.");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
  });

  it("returns 400 when no active campaign", async () => {
    mockedGetActive.mockReturnValue(null as any);

    const res = await app.request("/chat/history");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No active campaign loaded.");
  });

  it("returns 500 when getChatHistory throws", async () => {
    activateCampaign();
    mockedGetPremise.mockImplementation(() => {
      throw new Error("read error");
    });

    const res = await app.request("/chat/history");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /chat
// ---------------------------------------------------------------------------
describe("POST /chat", () => {
  it("streams storyteller response", async () => {
    activateCampaign();
    setupStoryteller();
    mockedGetPremise.mockReturnValue("A world of wonder.");
    mockedGetHistory.mockReturnValue([]);

    // Mock callStoryteller to return a fake stream response
    const fakeStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("The story continues..."));
        controller.close();
      },
    });
    mockedCallStoryteller.mockReturnValue({
      toTextStreamResponse: vi.fn(() =>
        new Response(fakeStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        })
      ),
    } as any);

    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "I open the door." }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("The story continues...");
    expect(mockedCallStoryteller).toHaveBeenCalledOnce();
  });

  it("returns 400 when no active campaign", async () => {
    mockedGetActive.mockReturnValue(null as any);

    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "test" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No active campaign loaded.");
  });

  it("returns 400 for empty playerAction", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "   " }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for missing playerAction", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
