import { describe, it, expect, vi } from "vitest";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  stepCountIs: vi.fn(() => () => false),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: vi.fn().mockRejectedValue(new Error("MCP not available")),
}));

vi.mock("@ai-sdk/mcp/mcp-stdio", () => ({
  Experimental_StdioMCPTransport: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  withMcpClient: vi.fn(async (_fn: unknown, fallbackFn: () => Promise<unknown>) => fallbackFn()),
}));

import { researchArchetype } from "../archetype-researcher.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

describe("researchArchetype", () => {
  it("returns null when research is disabled", async () => {
    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: false, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to LLM when MCP fails", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Rangers are skilled trackers and survivalists.",
    });

    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBe("Rangers are skilled trackers and survivalists.");
    const prompt = (mockGenerateText.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("profile");
    expect(prompt).toContain("motivations");
    expect(prompt).toContain("capabilities");
    expect(prompt).toContain("signature traits");
    expect(prompt).not.toContain("3-5 paragraphs suitable for inspiring an original RPG character");
  });

  it("returns null when both MCP and LLM fallback fail", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("LLM failed"));

    const result = await researchArchetype({
      archetype: "Unknown",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
  });

  it("returns null when LLM returns empty text", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "" });

    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
  });
});
