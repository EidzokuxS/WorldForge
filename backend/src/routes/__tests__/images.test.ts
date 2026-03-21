import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

vi.mock("../../campaign/paths.js", () => ({
  assertSafeId: vi.fn(),
  getImagesDir: vi.fn(() => "/mock/campaigns/abc-123/images"),
}));

vi.mock("../../images/index.js", () => ({
  generateImage: vi.fn(),
  resolveImageProvider: vi.fn(),
  cacheImage: vi.fn(),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(() => ({})),
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

import fs from "node:fs";
import {
  generateImage,
  resolveImageProvider,
  cacheImage,
} from "../../images/index.js";
import imageRoutes from "../images.js";

const mockedFs = vi.mocked(fs);
const mockedGenerateImage = vi.mocked(generateImage);
const mockedResolveProvider = vi.mocked(resolveImageProvider);
const mockedCacheImage = vi.mocked(cacheImage);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/images", imageRoutes);

const CAMPAIGN_ID = "abc-123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/images/:campaignId/:type/:filename
// ---------------------------------------------------------------------------
describe("GET /api/images/:campaignId/:type/:filename", () => {
  it("serves PNG with correct Content-Type header", async () => {
    const fakeData = Buffer.from("fake-png-data");
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(fakeData);

    const res = await app.request(
      `/api/images/${CAMPAIGN_ID}/portraits/hero.png`
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("returns 400 for invalid type", async () => {
    const res = await app.request(
      `/api/images/${CAMPAIGN_ID}/videos/hero.png`
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid image type");
  });

  it("returns 400 for invalid filename (path traversal)", async () => {
    const res = await app.request(
      `/api/images/${CAMPAIGN_ID}/portraits/..%2Fetc%2Fpasswd`
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid filename");
  });

  it("returns 404 when file does not exist", async () => {
    mockedFs.existsSync.mockReturnValue(false);

    const res = await app.request(
      `/api/images/${CAMPAIGN_ID}/portraits/missing.png`
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// POST /api/images/generate
// ---------------------------------------------------------------------------
describe("POST /api/images/generate", () => {
  const validBody = {
    campaignId: CAMPAIGN_ID,
    type: "portrait",
    entityId: "npc-001",
    prompt: "A fierce warrior with red hair",
  };

  it("generates and caches image on success", async () => {
    const imageBuffer = Buffer.from("generated-image");
    mockedResolveProvider.mockReturnValue({
      provider: { baseUrl: "http://img", apiKey: "k" },
      model: "dall-e",
    } as any);
    mockedGenerateImage.mockResolvedValue(imageBuffer);

    const res = await app.request("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.path).toContain("portraits");
    expect(body.path).toContain("npc-001.png");
    expect(mockedCacheImage).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "portraits",
      "npc-001.png",
      imageBuffer
    );
  });

  it("returns 400 when no image provider configured", async () => {
    mockedResolveProvider.mockReturnValue(null as any);

    const res = await app.request("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("disabled");
  });

  it("returns 400 for invalid body (missing prompt)", async () => {
    const res = await app.request("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        type: "portrait",
        entityId: "x",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
