import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveRoleModel,
  type RoleSettings,
  type ProviderSettings,
} from "../resolve-role-model.js";

describe("resolveRoleModel", () => {
  let providers: ProviderSettings[];

  beforeEach(() => {
    providers = [
      {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-key",
        defaultModel: "gpt-4o",
      },
      {
        id: "ollama",
        name: "Ollama Local",
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
        defaultModel: "llama3",
      },
    ];
  });

  it("resolves successfully when providerId matches a provider", () => {
    const role: RoleSettings = {
      providerId: "openai",
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.id).toBe("openai");
    expect(result.provider.name).toBe("OpenAI");
    expect(result.provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(result.provider.apiKey).toBe("sk-test-key");
  });

  it("uses provider's defaultModel when role model is not set", () => {
    const role: RoleSettings = {
      providerId: "openai",
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.model).toBe("gpt-4o");
  });

  it("uses provider's defaultModel when role model is undefined", () => {
    const role: RoleSettings = {
      providerId: "ollama",
      model: undefined,
      temperature: 0.5,
      maxTokens: 512,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.model).toBe("llama3");
  });

  it("uses role's model override when specified", () => {
    const role: RoleSettings = {
      providerId: "openai",
      model: "gpt-4o-mini",
      temperature: 0.9,
      maxTokens: 2048,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.model).toBe("gpt-4o-mini");
  });

  it("trims whitespace from role model before using it", () => {
    const role: RoleSettings = {
      providerId: "openai",
      model: "  gpt-4o-mini  ",
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.model).toBe("gpt-4o-mini");
  });

  it("falls back to defaultModel when role model is whitespace-only", () => {
    const role: RoleSettings = {
      providerId: "openai",
      model: "   ",
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.model).toBe("gpt-4o");
  });

  it("falls back to defaultModel when role model is empty string", () => {
    const role: RoleSettings = {
      providerId: "openai",
      model: "",
      temperature: 0.7,
      maxTokens: 1024,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.model).toBe("gpt-4o");
  });

  it("returns correct temperature and maxTokens from role", () => {
    const role: RoleSettings = {
      providerId: "openai",
      temperature: 1.5,
      maxTokens: 4096,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.temperature).toBe(1.5);
    expect(result.maxTokens).toBe(4096);
  });

  it("returns temperature 0 correctly", () => {
    const role: RoleSettings = {
      providerId: "openai",
      temperature: 0,
      maxTokens: 256,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.temperature).toBe(0);
    expect(result.maxTokens).toBe(256);
  });

  it("throws when providerId does not match any provider", () => {
    const role: RoleSettings = {
      providerId: "nonexistent",
      temperature: 0.7,
      maxTokens: 1024,
    };

    expect(() => resolveRoleModel(role, providers)).toThrow(
      'Provider "nonexistent" not found'
    );
  });

  it("throws when providers array is empty", () => {
    const role: RoleSettings = {
      providerId: "openai",
      temperature: 0.7,
      maxTokens: 1024,
    };

    expect(() => resolveRoleModel(role, [])).toThrow(
      'Provider "openai" not found'
    );
  });

  it("throws when no model is available (role empty, provider defaultModel empty)", () => {
    const providersNoDefault: ProviderSettings[] = [
      {
        id: "custom",
        name: "Custom",
        baseUrl: "http://localhost:8080",
        apiKey: "key",
        defaultModel: "",
      },
    ];

    const role: RoleSettings = {
      providerId: "custom",
      temperature: 0.7,
      maxTokens: 1024,
    };

    expect(() => resolveRoleModel(role, providersNoDefault)).toThrow(
      'No model configured for provider "Custom"'
    );
  });

  it("resolves the second provider when multiple providers exist", () => {
    const role: RoleSettings = {
      providerId: "ollama",
      temperature: 0.3,
      maxTokens: 512,
    };

    const result = resolveRoleModel(role, providers);

    expect(result.provider.id).toBe("ollama");
    expect(result.provider.name).toBe("Ollama Local");
    expect(result.provider.model).toBe("llama3");
  });

  it("returns complete ResolvedRole structure", () => {
    const role: RoleSettings = {
      providerId: "openai",
      model: "gpt-4o",
      temperature: 0.8,
      maxTokens: 2000,
    };

    const result = resolveRoleModel(role, providers);

    expect(result).toEqual({
      provider: {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-key",
        model: "gpt-4o",
      },
      temperature: 0.8,
      maxTokens: 2000,
    });
  });
});
