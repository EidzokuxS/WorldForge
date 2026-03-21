import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { resolveStartingLocation } from "../starting-location.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

describe("resolveStartingLocation", () => {
  beforeEach(() => {
    mockGenerateObject.mockClear();
  });

  it("returns location name and narrative", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        locationName: "Ironhaven",
        narrative: "The character arrives at the city gates.",
      },
    });

    const result = await resolveStartingLocation({
      premise: "Dark fantasy.",
      locationNames: ["Ironhaven", "Mistharbor"],
      userPrompt: "I want to start in a city.",
      role: fakeRole,
    });

    expect(result.locationName).toBe("Ironhaven");
    expect(result.narrative).toContain("city gates");
  });

  it("includes all location names in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { locationName: "Ironhaven", narrative: "test" },
    });

    await resolveStartingLocation({
      premise: "Fantasy.",
      locationNames: ["Ironhaven", "Mistharbor", "Darkwood"],
      userPrompt: "Anywhere.",
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("Ironhaven, Mistharbor, Darkwood");
  });

  it("includes user prompt in the LLM prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { locationName: "Ironhaven", narrative: "test" },
    });

    await resolveStartingLocation({
      premise: "Fantasy.",
      locationNames: ["Ironhaven"],
      userPrompt: "Near the coast",
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("Near the coast");
  });
});
