import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Provider, Settings } from "@worldforge/shared";
import { NONE_PROVIDER_ID } from "@worldforge/shared";
import {
  generateImage,
  isImageGenerationEnabled,
  resolveImageProvider,
  type GenerateImageOptions,
} from "../generate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "test-provider",
    name: "Test",
    baseUrl: "https://api.example.com",
    apiKey: "sk-test-key",
    defaultModel: "default-model",
    ...overrides,
  };
}

function makeSettings(overrides: {
  enabled?: boolean;
  providerId?: string;
  model?: string;
  providers?: Provider[];
} = {}): Settings {
  const provider = makeProvider();
  return {
    providers: overrides.providers ?? [provider],
    judge: { providerId: "", model: "", temperature: 0, maxTokens: 4096 },
    storyteller: { providerId: "", model: "", temperature: 0, maxTokens: 4096 },
    generator: { providerId: "", model: "", temperature: 0, maxTokens: 4096 },
    embedder: { providerId: "", model: "", temperature: 0, maxTokens: 4096 },
    fallback: { providerId: "", model: "", timeoutMs: 30000, retryCount: 1 },
    images: {
      enabled: overrides.enabled ?? true,
      providerId: overrides.providerId ?? "test-provider",
      model: overrides.model ?? "dall-e-3",
      stylePrompt: "",
    },
    research: {
      searchProvider: "duckduckgo",
      maxSearchSteps: 3,
    },
  } as Settings;
}

// ---------------------------------------------------------------------------
// isImageGenerationEnabled
// ---------------------------------------------------------------------------
describe("isImageGenerationEnabled", () => {
  it("returns true when enabled and provider is set", () => {
    const settings = makeSettings({ enabled: true, providerId: "openai" });
    expect(isImageGenerationEnabled(settings)).toBe(true);
  });

  it("returns false when disabled", () => {
    const settings = makeSettings({ enabled: false, providerId: "openai" });
    expect(isImageGenerationEnabled(settings)).toBe(false);
  });

  it("returns false when providerId is NONE", () => {
    const settings = makeSettings({
      enabled: true,
      providerId: NONE_PROVIDER_ID,
    });
    expect(isImageGenerationEnabled(settings)).toBe(false);
  });

  it("returns false when both disabled and NONE provider", () => {
    const settings = makeSettings({
      enabled: false,
      providerId: NONE_PROVIDER_ID,
    });
    expect(isImageGenerationEnabled(settings)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveImageProvider
// ---------------------------------------------------------------------------
describe("resolveImageProvider", () => {
  it("returns provider and model when configured", () => {
    const provider = makeProvider({ id: "img-prov" });
    const settings = makeSettings({
      enabled: true,
      providerId: "img-prov",
      model: "dall-e-3",
      providers: [provider],
    });

    const result = resolveImageProvider(settings);
    expect(result).toEqual({ provider, model: "dall-e-3" });
  });

  it("falls back to provider defaultModel when images.model is empty", () => {
    const provider = makeProvider({
      id: "img-prov",
      defaultModel: "fallback-model",
    });
    const settings = makeSettings({
      enabled: true,
      providerId: "img-prov",
      model: "",
      providers: [provider],
    });

    const result = resolveImageProvider(settings);
    expect(result).toEqual({ provider, model: "fallback-model" });
  });

  it("returns null when disabled", () => {
    const settings = makeSettings({ enabled: false });
    expect(resolveImageProvider(settings)).toBeNull();
  });

  it("returns null when provider not found in list", () => {
    const settings = makeSettings({
      enabled: true,
      providerId: "nonexistent",
      providers: [makeProvider({ id: "other" })],
    });
    expect(resolveImageProvider(settings)).toBeNull();
  });

  it("returns null when providerId is NONE", () => {
    const settings = makeSettings({
      enabled: true,
      providerId: NONE_PROVIDER_ID,
    });
    expect(resolveImageProvider(settings)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateImage
// ---------------------------------------------------------------------------
describe("generateImage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }) {
    globalThis.fetch = vi.fn().mockResolvedValue(response);
  }

  const baseOpts: GenerateImageOptions = {
    prompt: "A brave knight",
    provider: makeProvider({ baseUrl: "https://api.example.com/" }),
    model: "dall-e-3",
  };

  it("sends correct request to the API", async () => {
    const b64 = Buffer.from("fake-image").toString("base64");
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: b64 }] }),
    });

    await generateImage(baseOpts);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.example.com/v1/images/generations");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer sk-test-key");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("dall-e-3");
    expect(body.prompt).toBe("A brave knight");
    expect(body.n).toBe(1);
    expect(body.size).toBe("1024x1024");
    expect(body.response_format).toBe("b64_json");
  });

  it("strips trailing slashes from baseUrl", async () => {
    const b64 = Buffer.from("img").toString("base64");
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: b64 }] }),
    });

    await generateImage({
      ...baseOpts,
      provider: makeProvider({ baseUrl: "https://api.example.com///" }),
    });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/images/generations");
  });

  it("uses custom size when provided", async () => {
    const b64 = Buffer.from("img").toString("base64");
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: b64 }] }),
    });

    await generateImage({ ...baseOpts, size: "512x512" });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(init.body);
    expect(body.size).toBe("512x512");
  });

  it("returns a Buffer from base64 response", async () => {
    const original = Buffer.from("real-image-bytes");
    const b64 = original.toString("base64");
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: b64 }] }),
    });

    const result = await generateImage(baseOpts);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.equals(original)).toBe(true);
  });

  it("throws AppError on non-ok response with error message", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Bad prompt" } }),
    });

    await expect(generateImage(baseOpts)).rejects.toThrow("Bad prompt");
  });

  it("throws AppError with generic message when error body parse fails", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(generateImage(baseOpts)).rejects.toThrow(
      "Image generation failed with status 500"
    );
  });

  it("throws AppError when response has no image data", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    await expect(generateImage(baseOpts)).rejects.toThrow(
      "Image API returned no image data"
    );
  });

  it("throws AppError when data array is missing", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(generateImage(baseOpts)).rejects.toThrow(
      "Image API returned no image data"
    );
  });

  it("throws AppError when b64_json is missing from first item", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: "https://img.com/x.png" }] }),
    });

    await expect(generateImage(baseOpts)).rejects.toThrow(
      "Image API returned no image data"
    );
  });
});
