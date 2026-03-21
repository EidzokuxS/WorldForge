import { describe, it, expect, beforeEach } from "vitest";
import {
  createDefaultSettings,
  BUILTIN_PROVIDER_PRESETS,
  NONE_PROVIDER_ID,
  isLocalProvider,
  firstProviderId,
} from "../settings.js";
import type { Provider, Settings } from "../types.js";

// ---------------------------------------------------------------------------
// NONE_PROVIDER_ID
// ---------------------------------------------------------------------------
describe("NONE_PROVIDER_ID", () => {
  it("equals the sentinel string 'none'", () => {
    expect(NONE_PROVIDER_ID).toBe("none");
  });

  it("is a non-empty string", () => {
    expect(typeof NONE_PROVIDER_ID).toBe("string");
    expect(NONE_PROVIDER_ID.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// BUILTIN_PROVIDER_PRESETS
// ---------------------------------------------------------------------------
describe("BUILTIN_PROVIDER_PRESETS", () => {
  it("is an array with at least one provider", () => {
    expect(Array.isArray(BUILTIN_PROVIDER_PRESETS)).toBe(true);
    expect(BUILTIN_PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(1);
  });

  it("contains exactly 4 builtin providers", () => {
    expect(BUILTIN_PROVIDER_PRESETS).toHaveLength(4);
  });

  it.each(BUILTIN_PROVIDER_PRESETS)(
    "provider '$name' has all required fields",
    (provider: Provider) => {
      expect(typeof provider.id).toBe("string");
      expect(provider.id.length).toBeGreaterThan(0);

      expect(typeof provider.name).toBe("string");
      expect(provider.name.length).toBeGreaterThan(0);

      expect(typeof provider.baseUrl).toBe("string");
      expect(provider.baseUrl).toMatch(/^https?:\/\//);

      expect(typeof provider.apiKey).toBe("string");

      expect(typeof provider.defaultModel).toBe("string");
      expect(provider.defaultModel.length).toBeGreaterThan(0);
    },
  );

  it("marks every preset as builtin", () => {
    for (const provider of BUILTIN_PROVIDER_PRESETS) {
      expect(provider.isBuiltin).toBe(true);
    }
  });

  it("has unique ids across all presets", () => {
    const ids = BUILTIN_PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique names across all presets", () => {
    const names = BUILTIN_PROVIDER_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("ships with empty API keys (user must fill them in)", () => {
    for (const provider of BUILTIN_PROVIDER_PRESETS) {
      expect(provider.apiKey).toBe("");
    }
  });

  it("includes the expected providers by name", () => {
    const names = BUILTIN_PROVIDER_PRESETS.map((p) => p.name);
    expect(names).toContain("OpenAI");
    expect(names).toContain("Anthropic");
    expect(names).toContain("OpenRouter");
    expect(names).toContain("Ollama");
  });

  it("all ids start with 'builtin-' prefix", () => {
    for (const provider of BUILTIN_PROVIDER_PRESETS) {
      expect(provider.id).toMatch(/^builtin-/);
    }
  });
});

// ---------------------------------------------------------------------------
// isLocalProvider
// ---------------------------------------------------------------------------
describe("isLocalProvider", () => {
  it.each([
    "http://localhost:11434/v1",
    "http://localhost:8080",
    "https://localhost/api",
    "http://127.0.0.1:5000",
    "http://127.0.0.1/v1",
    "http://0.0.0.0:3000",
    "http://0.0.0.0:11434/v1",
    "http://LOCALHOST:8080",
  ])("returns true for local URL: %s", (url) => {
    expect(isLocalProvider(url)).toBe(true);
  });

  it.each([
    "https://api.openai.com/v1",
    "https://openrouter.ai/api/v1",
    "https://api.anthropic.com/v1",
    "https://example.com",
    "https://my-server.com:8080",
  ])("returns false for remote URL: %s", (url) => {
    expect(isLocalProvider(url)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// firstProviderId
// ---------------------------------------------------------------------------
describe("firstProviderId", () => {
  it("returns the first provider's id from a non-empty array", () => {
    const providers: Provider[] = [
      {
        id: "custom-1",
        name: "Custom",
        baseUrl: "https://example.com",
        apiKey: "",
        defaultModel: "m1",
        isBuiltin: false,
      },
      {
        id: "custom-2",
        name: "Other",
        baseUrl: "https://other.com",
        apiKey: "",
        defaultModel: "m2",
        isBuiltin: false,
      },
    ];
    expect(firstProviderId(providers)).toBe("custom-1");
  });

  it("falls back to BUILTIN_PROVIDER_PRESETS[0].id for an empty array", () => {
    expect(firstProviderId([])).toBe(BUILTIN_PROVIDER_PRESETS[0].id);
  });

  it("returns builtin preset id when given the builtin array", () => {
    expect(firstProviderId(BUILTIN_PROVIDER_PRESETS)).toBe(
      BUILTIN_PROVIDER_PRESETS[0].id,
    );
  });
});

// ---------------------------------------------------------------------------
// createDefaultSettings
// ---------------------------------------------------------------------------
describe("createDefaultSettings", () => {
  let settings: Settings;

  // Fresh settings object for each test to avoid mutation side-effects
  beforeEach(() => {
    settings = createDefaultSettings();
  });

  // --- top-level shape ---

  it("returns an object with all required top-level keys", () => {
    expect(settings).toHaveProperty("providers");
    expect(settings).toHaveProperty("judge");
    expect(settings).toHaveProperty("storyteller");
    expect(settings).toHaveProperty("generator");
    expect(settings).toHaveProperty("embedder");
    expect(settings).toHaveProperty("fallback");
    expect(settings).toHaveProperty("images");
    expect(settings).toHaveProperty("research");
  });

  it("returns a new object on every call (no shared reference)", () => {
    const a = createDefaultSettings();
    const b = createDefaultSettings();
    expect(a).not.toBe(b);
    expect(a.providers).not.toBe(b.providers);
  });

  // --- providers ---

  it("includes a copy of BUILTIN_PROVIDER_PRESETS as providers", () => {
    expect(settings.providers).toHaveLength(BUILTIN_PROVIDER_PRESETS.length);
    expect(settings.providers).toEqual(BUILTIN_PROVIDER_PRESETS);
    // Must be a copy, not the original array
    expect(settings.providers).not.toBe(BUILTIN_PROVIDER_PRESETS);
  });

  // --- judge role ---

  describe("judge role", () => {
    it("uses the first provider id", () => {
      expect(settings.judge.providerId).toBe(BUILTIN_PROVIDER_PRESETS[0].id);
    });

    it("has temperature 0 (deterministic)", () => {
      expect(settings.judge.temperature).toBe(0);
    });

    it("has maxTokens 512", () => {
      expect(settings.judge.maxTokens).toBe(512);
    });

    it("has empty model string (user picks)", () => {
      expect(settings.judge.model).toBe("");
    });
  });

  // --- storyteller role ---

  describe("storyteller role", () => {
    it("uses the first provider id", () => {
      expect(settings.storyteller.providerId).toBe(
        BUILTIN_PROVIDER_PRESETS[0].id,
      );
    });

    it("has temperature 0.8 (creative)", () => {
      expect(settings.storyteller.temperature).toBe(0.8);
    });

    it("has maxTokens 1024", () => {
      expect(settings.storyteller.maxTokens).toBe(1024);
    });

    it("has empty model string", () => {
      expect(settings.storyteller.model).toBe("");
    });
  });

  // --- generator role ---

  describe("generator role", () => {
    it("uses the first provider id", () => {
      expect(settings.generator.providerId).toBe(
        BUILTIN_PROVIDER_PRESETS[0].id,
      );
    });

    it("has temperature 0.7", () => {
      expect(settings.generator.temperature).toBe(0.7);
    });

    it("has maxTokens 4096", () => {
      expect(settings.generator.maxTokens).toBe(4096);
    });

    it("has empty model string", () => {
      expect(settings.generator.model).toBe("");
    });
  });

  // --- fallback ---

  describe("fallback config", () => {
    it("uses the first provider id", () => {
      expect(settings.fallback.providerId).toBe(
        BUILTIN_PROVIDER_PRESETS[0].id,
      );
    });

    it("has model 'gpt-4o-mini'", () => {
      expect(settings.fallback.model).toBe("gpt-4o-mini");
    });

    it("has timeoutMs 30000", () => {
      expect(settings.fallback.timeoutMs).toBe(30_000);
    });

    it("has retryCount 1", () => {
      expect(settings.fallback.retryCount).toBe(1);
    });
  });

  // --- images ---

  describe("images config", () => {
    it("uses NONE_PROVIDER_ID as default provider", () => {
      expect(settings.images.providerId).toBe(NONE_PROVIDER_ID);
    });

    it("has empty model string", () => {
      expect(settings.images.model).toBe("");
    });

    it("has a non-empty stylePrompt", () => {
      expect(typeof settings.images.stylePrompt).toBe("string");
      expect(settings.images.stylePrompt.length).toBeGreaterThan(0);
    });

    it("is disabled by default", () => {
      expect(settings.images.enabled).toBe(false);
    });
  });

  // --- embedder role ---

  describe("embedder role", () => {
    it("uses the first provider id", () => {
      expect(settings.embedder.providerId).toBe(
        BUILTIN_PROVIDER_PRESETS[0].id,
      );
    });

    it("has temperature 0 (deterministic)", () => {
      expect(settings.embedder.temperature).toBe(0);
    });

    it("has maxTokens 512", () => {
      expect(settings.embedder.maxTokens).toBe(512);
    });

    it("has empty model string", () => {
      expect(settings.embedder.model).toBe("");
    });
  });

  // --- research ---

  describe("research config", () => {
    it("is enabled by default", () => {
      expect(settings.research.enabled).toBe(true);
    });

    it("has maxSearchSteps 10", () => {
      expect(settings.research.maxSearchSteps).toBe(10);
    });

    it("defaults searchProvider to 'duckduckgo'", () => {
      expect(settings.research.searchProvider).toBe("duckduckgo");
    });
  });

  // --- role temperatures are ordered sensibly ---

  it("judge temperature <= storyteller temperature", () => {
    expect(settings.judge.temperature).toBeLessThanOrEqual(
      settings.storyteller.temperature,
    );
  });

  it("judge temperature <= generator temperature", () => {
    expect(settings.judge.temperature).toBeLessThanOrEqual(
      settings.generator.temperature,
    );
  });

  // --- maxTokens hierarchy ---

  it("generator maxTokens >= storyteller maxTokens >= judge maxTokens", () => {
    expect(settings.generator.maxTokens).toBeGreaterThanOrEqual(
      settings.storyteller.maxTokens,
    );
    expect(settings.storyteller.maxTokens).toBeGreaterThanOrEqual(
      settings.judge.maxTokens,
    );
  });
});
