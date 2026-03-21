import { describe, it, expect, vi } from "vitest";
import {
  withModelFallback,
  resolveFallbackProvider,
} from "../with-model-fallback.js";
import type { Provider, FallbackConfig } from "@worldforge/shared";

// ── withModelFallback ────────────────────────────────────────────────────────

describe("withModelFallback", () => {
  it("returns primary result when primary succeeds", async () => {
    const primary = vi.fn().mockResolvedValue("primary-result");
    const fallback = vi.fn().mockResolvedValue("fallback-result");

    const result = await withModelFallback(primary, fallback, "test-ctx");

    expect(result).toBe("primary-result");
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("returns fallback result when primary fails", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("primary broke"));
    const fallback = vi.fn().mockResolvedValue("fallback-result");

    const result = await withModelFallback(primary, fallback, "test-ctx");

    expect(result).toBe("fallback-result");
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("throws fallback error when both fail", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("primary broke"));
    const fallback = vi.fn().mockRejectedValue(new Error("fallback broke"));

    await expect(
      withModelFallback(primary, fallback, "test-ctx")
    ).rejects.toThrow("fallback broke");
  });

  it("preserves the return type (generic)", async () => {
    const primary = vi.fn().mockResolvedValue({ count: 42 });
    const fallback = vi.fn().mockResolvedValue({ count: 0 });

    const result = await withModelFallback<{ count: number }>(
      primary,
      fallback,
      "typed-ctx"
    );

    expect(result).toEqual({ count: 42 });
  });

  it("does not swallow non-Error rejections", async () => {
    const primary = vi.fn().mockRejectedValue("string-error");
    const fallback = vi.fn().mockRejectedValue(404);

    await expect(
      withModelFallback(primary, fallback, "test-ctx")
    ).rejects.toBe(404);
  });
});

// ── resolveFallbackProvider ──────────────────────────────────────────────────

describe("resolveFallbackProvider", () => {
  const providers: Provider[] = [
    {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-test",
      defaultModel: "gpt-4",
    },
    {
      id: "glm",
      name: "GLM",
      baseUrl: "https://z.ai/api",
      apiKey: "sk-glm-test",
      defaultModel: "glm-4",
    },
  ];

  const baseFallback: FallbackConfig = {
    providerId: "openrouter",
    model: "claude-3",
    timeoutMs: 30000,
    retryCount: 1,
  };

  it("resolves a valid fallback provider config", () => {
    const result = resolveFallbackProvider(baseFallback, providers);

    expect(result).toEqual({
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-test",
      model: "claude-3",
    });
  });

  it("uses provider defaultModel when fallback model is empty", () => {
    const fallback: FallbackConfig = {
      ...baseFallback,
      model: "",
    };

    const result = resolveFallbackProvider(fallback, providers);

    expect(result).not.toBeNull();
    expect(result!.model).toBe("gpt-4");
  });

  it("uses provider defaultModel when fallback model is whitespace", () => {
    const fallback: FallbackConfig = {
      ...baseFallback,
      model: "   ",
    };

    const result = resolveFallbackProvider(fallback, providers);

    expect(result).not.toBeNull();
    expect(result!.model).toBe("gpt-4");
  });

  it("returns null when providerId is empty", () => {
    const fallback: FallbackConfig = {
      ...baseFallback,
      providerId: "",
    };

    expect(resolveFallbackProvider(fallback, providers)).toBeNull();
  });

  it("returns null when provider is not found", () => {
    const fallback: FallbackConfig = {
      ...baseFallback,
      providerId: "nonexistent",
    };

    expect(resolveFallbackProvider(fallback, providers)).toBeNull();
  });

  it("returns null when provider has no defaultModel and fallback model is empty", () => {
    const noDefaultProviders: Provider[] = [
      {
        id: "bare",
        name: "Bare",
        baseUrl: "https://bare.ai",
        apiKey: "sk-bare",
        defaultModel: "",
      },
    ];
    const fallback: FallbackConfig = {
      ...baseFallback,
      providerId: "bare",
      model: "",
    };

    expect(resolveFallbackProvider(fallback, noDefaultProviders)).toBeNull();
  });
});
