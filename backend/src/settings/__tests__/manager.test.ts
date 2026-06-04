import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Settings, Provider } from "@worldforge/shared";
import {
  BUILTIN_PROVIDER_PRESETS,
  NONE_PROVIDER_ID,
  createDefaultSettings,
} from "@worldforge/shared";

// ---------------------------------------------------------------------------
// Mock node:fs before importing the module under test
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import {
  normalizeSettings,
  rebindProviderReferences,
  loadSettings,
  saveSettings,
} from "../manager.js";

const mockedFs = vi.mocked(fs);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function defaults(): Settings {
  return createDefaultSettings();
}

const FIRST_BUILTIN_ID = BUILTIN_PROVIDER_PRESETS[0].id;

function makeCustomProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "custom-1",
    name: "Custom Provider",
    baseUrl: "https://custom.example.com/v1",
    apiKey: "sk-custom-key",
    defaultModel: "custom-model",
    isBuiltin: false,
    ...overrides,
  };
}

function makeMinimalValidSettings(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  const d = defaults();
  return {
    providers: d.providers,
    judge: d.judge,
    storyteller: d.storyteller,
    generator: d.generator,
    embedder: d.embedder,
    images: d.images,
    research: d.research,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeSettings
// ---------------------------------------------------------------------------
describe("normalizeSettings", () => {
  describe("with non-object input", () => {
    it("returns defaults for null", () => {
      const result = normalizeSettings(null);
      expect(result.providers.length).toBeGreaterThanOrEqual(
        BUILTIN_PROVIDER_PRESETS.length
      );
      expect(result.judge.providerId).toBe(FIRST_BUILTIN_ID);
    });

    it("returns defaults for undefined", () => {
      const result = normalizeSettings(undefined);
      expect(result.judge.temperature).toBe(defaults().judge.temperature);
    });

    it("returns defaults for a number", () => {
      const result = normalizeSettings(42);
      expect(result.storyteller.maxTokens).toBe(
        defaults().storyteller.maxTokens
      );
    });

    it("returns defaults for a string", () => {
      const result = normalizeSettings("hello");
      expect(result.images.enabled).toBe(defaults().images.enabled);
    });

    it("returns defaults for a boolean", () => {
      const result = normalizeSettings(true);
      expect(result.images.enabled).toBe(false);
    });
  });

  describe("with an empty object", () => {
    it("returns settings with all builtin providers", () => {
      const result = normalizeSettings({});
      const builtinIds = BUILTIN_PROVIDER_PRESETS.map((p) => p.id);
      for (const id of builtinIds) {
        expect(result.providers.some((p) => p.id === id)).toBe(true);
      }
    });

    it("uses default role configs", () => {
      const result = normalizeSettings({});
      const d = defaults();
      expect(result.judge.temperature).toBe(d.judge.temperature);
      expect(result.judge.maxTokens).toBe(d.judge.maxTokens);
      expect(result.storyteller.temperature).toBe(d.storyteller.temperature);
      expect(result.generator.temperature).toBe(d.generator.temperature);
    });

    it("images default to disabled with NONE provider", () => {
      const result = normalizeSettings({});
      expect(result.images.enabled).toBe(false);
      expect(result.images.providerId).toBe(NONE_PROVIDER_ID);
    });
  });

  describe("provider sanitization", () => {
    it("filters out providers without an id", () => {
      const result = normalizeSettings({
        providers: [
          { name: "No ID", baseUrl: "http://x", apiKey: "", defaultModel: "" },
        ],
      });
      // Should still have builtins even if custom was rejected
      expect(result.providers.length).toBe(BUILTIN_PROVIDER_PRESETS.length);
    });

    it("filters out non-object provider entries", () => {
      const result = normalizeSettings({
        providers: [null, undefined, 42, "string", true],
      });
      expect(result.providers.length).toBe(BUILTIN_PROVIDER_PRESETS.length);
    });

    it("trims provider fields", () => {
      const result = normalizeSettings({
        providers: [
          {
            id: "  custom-trimmed  ",
            name: "  Trimmed  ",
            baseUrl: "  http://example.com  ",
            apiKey: "  key  ",
            defaultModel: "  model  ",
          },
        ],
      });
      const custom = result.providers.find((p) => p.id === "custom-trimmed");
      expect(custom).toBeDefined();
      expect(custom!.name).toBe("Trimmed");
      expect(custom!.baseUrl).toBe("http://example.com");
      expect(custom!.apiKey).toBe("key");
      expect(custom!.defaultModel).toBe("model");
    });

    it("assigns 'Custom Provider' name when name is empty", () => {
      const result = normalizeSettings({
        providers: [
          {
            id: "custom-noname",
            name: "   ",
            baseUrl: "",
            apiKey: "",
            defaultModel: "",
          },
        ],
      });
      const custom = result.providers.find((p) => p.id === "custom-noname");
      expect(custom).toBeDefined();
      expect(custom!.name).toBe("Custom Provider");
    });

    it("preserves custom providers alongside builtins", () => {
      const custom = makeCustomProvider();
      const result = normalizeSettings({ providers: [custom] });
      expect(result.providers.length).toBe(
        BUILTIN_PROVIDER_PRESETS.length + 1
      );
      const found = result.providers.find((p) => p.id === custom.id);
      expect(found).toBeDefined();
      expect(found!.isBuiltin).toBe(false);
    });

    it("merges user data into builtin providers (apiKey)", () => {
      const builtinWithKey = {
        ...BUILTIN_PROVIDER_PRESETS[0],
        apiKey: "sk-user-key",
      };
      const result = normalizeSettings({ providers: [builtinWithKey] });
      const merged = result.providers.find(
        (p) => p.id === BUILTIN_PROVIDER_PRESETS[0].id
      );
      expect(merged).toBeDefined();
      expect(merged!.apiKey).toBe("sk-user-key");
      expect(merged!.isBuiltin).toBe(true);
    });
  });

  describe("role config normalization", () => {
    it("preserves an unknown providerId instead of silently rebinding it", () => {
      const result = normalizeSettings({
        judge: { providerId: "nonexistent-provider", temperature: 0.5 },
      });
      expect(result.judge.providerId).toBe("nonexistent-provider");
    });

    it("preserves valid providerId on role", () => {
      const secondBuiltin = BUILTIN_PROVIDER_PRESETS[1].id;
      const result = normalizeSettings({
        judge: { providerId: secondBuiltin, temperature: 0.5, maxTokens: 1000 },
      });
      expect(result.judge.providerId).toBe(secondBuiltin);
    });

    it("clamps temperature to [0, 2] range", () => {
      const result = normalizeSettings({
        storyteller: { temperature: 5.0, maxTokens: 1024 },
      });
      expect(result.storyteller.temperature).toBeLessThanOrEqual(2);

      const result2 = normalizeSettings({
        storyteller: { temperature: -1, maxTokens: 1024 },
      });
      expect(result2.storyteller.temperature).toBeGreaterThanOrEqual(0);
    });

    it("clamps maxTokens to [1, 32000] range", () => {
      const result = normalizeSettings({
        judge: { maxTokens: 100000 },
      });
      expect(result.judge.maxTokens).toBeLessThanOrEqual(32000);

      const result2 = normalizeSettings({
        judge: { maxTokens: -5 },
      });
      expect(result2.judge.maxTokens).toBeGreaterThanOrEqual(1);
    });

    it("rounds maxTokens to nearest integer", () => {
      const result = normalizeSettings({
        judge: { maxTokens: 512.7 },
      });
      expect(Number.isInteger(result.judge.maxTokens)).toBe(true);
    });

    it("uses default temperature when value is NaN", () => {
      const result = normalizeSettings({
        judge: { temperature: NaN },
      });
      expect(result.judge.temperature).toBe(defaults().judge.temperature);
    });

    it("uses default temperature when value is a string", () => {
      const result = normalizeSettings({
        judge: { temperature: "hot" },
      });
      expect(result.judge.temperature).toBe(defaults().judge.temperature);
    });

    it("uses default model when model is not a string", () => {
      const result = normalizeSettings({
        judge: { model: 123 },
      });
      expect(result.judge.model).toBe(defaults().judge.model);
    });
  });

  describe("images config normalization", () => {
    it("defaults images.providerId to NONE when not a valid provider", () => {
      const result = normalizeSettings({
        images: { providerId: "nonexistent" },
      });
      expect(result.images.providerId).toBe(NONE_PROVIDER_ID);
    });

    it("preserves NONE_PROVIDER_ID for images", () => {
      const result = normalizeSettings({
        images: { providerId: NONE_PROVIDER_ID },
      });
      expect(result.images.providerId).toBe(NONE_PROVIDER_ID);
    });

    it("preserves valid provider id for images", () => {
      const result = normalizeSettings({
        images: { providerId: FIRST_BUILTIN_ID },
      });
      expect(result.images.providerId).toBe(FIRST_BUILTIN_ID);
    });

    it("defaults images.enabled to false when not provided", () => {
      const result = normalizeSettings({
        images: {},
      });
      expect(result.images.enabled).toBe(false);
    });

    it("coerces truthy images.enabled to true", () => {
      const result = normalizeSettings({
        images: { enabled: 1, providerId: FIRST_BUILTIN_ID },
      });
      expect(result.images.enabled).toBe(true);
    });

    it("uses default stylePrompt when not provided", () => {
      const result = normalizeSettings({
        images: {},
      });
      expect(result.images.stylePrompt).toBe(defaults().images.stylePrompt);
    });

    it("preserves custom stylePrompt", () => {
      const result = normalizeSettings({
        images: { stylePrompt: "pixel art, retro" },
      });
      expect(result.images.stylePrompt).toBe("pixel art, retro");
    });
  });

  describe("with missing or partial research config", () => {
    it("returns research defaults when research is missing", () => {
      const result = normalizeSettings({});
      expect(result.research.enabled).toBe(defaults().research.enabled);
      expect(result.research.maxSearchSteps).toBe(defaults().research.maxSearchSteps);
    });

    it("returns research defaults when research is null", () => {
      const result = normalizeSettings({ research: null });
      expect(result.research.enabled).toBe(defaults().research.enabled);
      expect(result.research.maxSearchSteps).toBe(defaults().research.maxSearchSteps);
    });

    it("preserves custom research.enabled", () => {
      const result = normalizeSettings({ research: { enabled: false } });
      expect(result.research.enabled).toBe(false);
    });

    it("preserves custom research.maxSearchSteps", () => {
      const result = normalizeSettings({ research: { maxSearchSteps: 50 } });
      expect(result.research.maxSearchSteps).toBe(50);
    });

    it("clamps research.maxSearchSteps below 1 to min", () => {
      const result = normalizeSettings({ research: { maxSearchSteps: 0 } });
      expect(result.research.maxSearchSteps).toBe(1);
    });

    it("clamps research.maxSearchSteps above 100 to max", () => {
      const result = normalizeSettings({ research: { maxSearchSteps: 200 } });
      expect(result.research.maxSearchSteps).toBe(100);
    });

    it("uses default for non-boolean research.enabled", () => {
      const result = normalizeSettings({ research: { enabled: "yes" } });
      expect(result.research.enabled).toBe(defaults().research.enabled);
    });
  });

  describe("full round-trip", () => {
    it("normalizing default settings returns equivalent defaults", () => {
      const d = defaults();
      const result = normalizeSettings(d);
      expect(result.judge.temperature).toBe(d.judge.temperature);
      expect(result.storyteller.maxTokens).toBe(d.storyteller.maxTokens);
      expect(result.images.enabled).toBe(d.images.enabled);
    });
  });
});

// ---------------------------------------------------------------------------
// rebindProviderReferences
// ---------------------------------------------------------------------------
describe("rebindProviderReferences", () => {
  it("ensures all builtin providers are present", () => {
    const settings = defaults();
    const result = rebindProviderReferences(settings);
    const builtinIds = BUILTIN_PROVIDER_PRESETS.map((p) => p.id);
    for (const id of builtinIds) {
      expect(result.providers.some((p) => p.id === id)).toBe(true);
    }
  });

  it("keeps custom providers alongside builtins", () => {
    const settings = defaults();
    const custom = makeCustomProvider();
    settings.providers.push(custom);
    const result = rebindProviderReferences(settings);
    expect(result.providers.find((p) => p.id === "custom-1")).toBeDefined();
  });

  it("preserves judge.providerId when it points at a deleted provider", () => {
    const settings = defaults();
    settings.judge.providerId = "deleted-provider";
    const result = rebindProviderReferences(settings);
    expect(result.judge.providerId).toBe("deleted-provider");
  });

  it("preserves storyteller.providerId when it points at a deleted provider", () => {
    const settings = defaults();
    settings.storyteller.providerId = "deleted-provider";
    const result = rebindProviderReferences(settings);
    expect(result.storyteller.providerId).toBe("deleted-provider");
  });

  it("preserves generator.providerId when it points at a deleted provider", () => {
    const settings = defaults();
    settings.generator.providerId = "deleted-provider";
    const result = rebindProviderReferences(settings);
    expect(result.generator.providerId).toBe("deleted-provider");
  });

  it("keeps valid provider references unchanged", () => {
    const settings = defaults();
    const secondId = BUILTIN_PROVIDER_PRESETS[1].id;
    settings.judge.providerId = secondId;
    const result = rebindProviderReferences(settings);
    expect(result.judge.providerId).toBe(secondId);
  });

  it("sets images.providerId to NONE when provider is invalid", () => {
    const settings = defaults();
    settings.images.providerId = "deleted-image-provider";
    const result = rebindProviderReferences(settings);
    expect(result.images.providerId).toBe(NONE_PROVIDER_ID);
  });

  it("preserves NONE images.providerId", () => {
    const settings = defaults();
    settings.images.providerId = NONE_PROVIDER_ID;
    const result = rebindProviderReferences(settings);
    expect(result.images.providerId).toBe(NONE_PROVIDER_ID);
  });

  it("preserves valid images.providerId", () => {
    const settings = defaults();
    settings.images.providerId = FIRST_BUILTIN_ID;
    const result = rebindProviderReferences(settings);
    expect(result.images.providerId).toBe(FIRST_BUILTIN_ID);
  });

  it("fills in default stylePrompt when empty", () => {
    const settings = defaults();
    settings.images.stylePrompt = "";
    const result = rebindProviderReferences(settings);
    expect(result.images.stylePrompt).toBe(defaults().images.stylePrompt);
  });

  it("preserves custom stylePrompt when non-empty", () => {
    const settings = defaults();
    settings.images.stylePrompt = "watercolor, soft";
    const result = rebindProviderReferences(settings);
    expect(result.images.stylePrompt).toBe("watercolor, soft");
  });

  it("merges user apiKey into builtin providers", () => {
    const settings = defaults();
    const builtinProvider = settings.providers.find(
      (p) => p.id === FIRST_BUILTIN_ID
    )!;
    builtinProvider.apiKey = "sk-my-key";
    const result = rebindProviderReferences(settings);
    const merged = result.providers.find((p) => p.id === FIRST_BUILTIN_ID)!;
    expect(merged.apiKey).toBe("sk-my-key");
    expect(merged.isBuiltin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadSettings
// ---------------------------------------------------------------------------
describe("loadSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates default settings when file does not exist", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    const result = loadSettings();
    expect(result.providers.length).toBeGreaterThanOrEqual(
      BUILTIN_PROVIDER_PRESETS.length
    );
    expect(result.judge.providerId).toBe(FIRST_BUILTIN_ID);
    expect(mockedFs.writeFileSync).toHaveBeenCalledOnce();
  });

  it("writes default settings to disk when file does not exist", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    loadSettings();

    const [, content] = mockedFs.writeFileSync.mock.calls[0] as [
      string,
      string,
      string,
    ];
    const written = JSON.parse(content) as Settings;
    expect(written.judge).toBeDefined();
    expect(written.providers).toBeDefined();
  });

  it("reads and normalizes existing file", () => {
    const stored = defaults();
    stored.judge.temperature = 0.5;

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(stored));
    mockedFs.writeFileSync.mockImplementation(() => {});

    const result = loadSettings();
    expect(result.judge.temperature).toBe(0.5);
  });

  it("re-writes normalized settings after reading", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(defaults()));
    mockedFs.writeFileSync.mockImplementation(() => {});

    loadSettings();
    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/settings\.json\.bak$/),
      expect.any(String),
      "utf-8",
    );
    expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/settings\.json$/),
      expect.any(String),
      "utf-8",
    );
  });

  it("throws and preserves a backup when file contains invalid JSON", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue("not valid json {{{");
    mockedFs.writeFileSync.mockImplementation(() => {});

    expect(() => loadSettings()).toThrow(/invalid json/i);
    expect(mockedFs.writeFileSync).toHaveBeenCalledOnce();
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/settings\.json\.bak$/),
      "not valid json {{{",
      "utf-8",
    );
  });

  it("throws when readFileSync fails for an existing file", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    mockedFs.writeFileSync.mockImplementation(() => {});

    expect(() => loadSettings()).toThrow(/failed to read settings file/i);
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// saveSettings
// ---------------------------------------------------------------------------
describe("saveSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("normalizes and writes settings to disk", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    const input = makeMinimalValidSettings();
    saveSettings(input);

    expect(mockedFs.writeFileSync).toHaveBeenCalledOnce();
  });

  it("returns the normalized settings", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    const result = saveSettings({});
    expect(result.providers.length).toBeGreaterThanOrEqual(
      BUILTIN_PROVIDER_PRESETS.length
    );
    expect(result.judge).toBeDefined();
    expect(result.storyteller).toBeDefined();
  });

  it("keeps invalid role provider references explicit after normalizing", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    const input = makeMinimalValidSettings({
      judge: { providerId: "nonexistent-provider", temperature: 0 },
    });
    const result = saveSettings(input);

    expect(result.judge.providerId).toBe("nonexistent-provider");
  });

  it("writes JSON with 2-space indentation", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    saveSettings(defaults());

    const [, content] = mockedFs.writeFileSync.mock.calls[0] as [
      string,
      string,
      string,
    ];
    // JSON.stringify with 2-space indent starts second line with 2 spaces
    expect(content).toContain("\n  ");
  });

  it("writes with utf-8 encoding", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    saveSettings(defaults());

    const [, , encoding] = mockedFs.writeFileSync.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(encoding).toBe("utf-8");
  });

  it("handles null input gracefully (returns defaults)", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(() => {});

    const result = saveSettings(null);
    expect(result.judge.providerId).toBe(FIRST_BUILTIN_ID);
  });

  it("backs up the current settings file before overwriting it", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(defaults()));
    mockedFs.writeFileSync.mockImplementation(() => {});

    const input = makeMinimalValidSettings({
      providers: [...defaults().providers, makeCustomProvider()],
    });

    saveSettings(input);

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/settings\.json\.bak$/),
      expect.any(String),
      "utf-8",
    );
    expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/settings\.json$/),
      expect.any(String),
      "utf-8",
    );
  });
});
