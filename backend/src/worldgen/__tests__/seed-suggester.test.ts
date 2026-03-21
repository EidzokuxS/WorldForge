import { describe, it, expect, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { suggestWorldSeeds, suggestSingleSeed } from "../seed-suggester.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

const fakeSeeds = {
  geography: "Volcanic archipelago",
  politicalStructure: "Feudal monarchy",
  centralConflict: "War between islands",
  culturalFlavor: ["Polynesian", "Norse"],
  environment: "Tropical storms",
  wildcard: "Living coral cities",
};

describe("suggestWorldSeeds", () => {
  it("returns seeds from generateObject", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeSeeds });

    const result = await suggestWorldSeeds({
      premise: "A volcanic island world.",
      role: fakeRole,
    });

    expect(result).toEqual(fakeSeeds);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("includes premise in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeSeeds });

    await suggestWorldSeeds({ premise: "A volcanic island world.", role: fakeRole });

    const callArgs = mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.prompt).toContain("A volcanic island world.");
  });
});

describe("suggestSingleSeed", () => {
  it("returns a string for non-culturalFlavor category", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: { value: "Vast desert" } });

    const result = await suggestSingleSeed({
      premise: "Desert world.",
      role: fakeRole,
      category: "geography",
    });

    expect(result).toBe("Vast desert");
  });

  it("returns an array for culturalFlavor category", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { value: ["Arabic", "Berber"] },
    });

    const result = await suggestSingleSeed({
      premise: "Desert world.",
      role: fakeRole,
      category: "culturalFlavor",
    });

    expect(result).toEqual(["Arabic", "Berber"]);
  });
});
