import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { suggestWorldSeeds, suggestSingleSeed } from "../seed-suggester.js";
import type { IpResearchContext } from "../ip-researcher.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

const fakeIpContext: IpResearchContext = {
  franchise: "Naruto",
  keyFacts: ["Ninja villages", "Chakra system"],
  tonalNotes: ["Shonen action"],
  source: "mcp",
};

beforeEach(() => {
  mockGenerateObject.mockReset();
});

describe("suggestWorldSeeds (sequential DNA)", () => {
  function setupSequentialMocks() {
    // 6 calls: geography, politicalStructure, centralConflict, culturalFlavor, environment, wildcard
    mockGenerateObject
      .mockResolvedValueOnce({ object: { value: "Five Great Shinobi Nations", reasoning: "Canonical geography" } })
      .mockResolvedValueOnce({ object: { value: "Hidden Village system", reasoning: "Flows from geography" } })
      .mockResolvedValueOnce({ object: { value: "Akatsuki threat", reasoning: "Flows from political structure" } })
      .mockResolvedValueOnce({ object: { value: ["Japanese feudal", "Martial arts"], reasoning: "Cultural roots" } })
      .mockResolvedValueOnce({ object: { value: "Temperate forests", reasoning: "Fire Country terrain" } })
      .mockResolvedValueOnce({ object: { value: "Bijuu sealed in hosts", reasoning: "Unique power system" } });
  }

  it("calls generateObject 6 times sequentially (one per DNA category)", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    expect(mockGenerateObject).toHaveBeenCalledTimes(6);
  });

  it("returns seeds assembled from 6 sequential calls", async () => {
    setupSequentialMocks();

    const result = await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    expect(result).toEqual({
      seeds: {
        geography: "Five Great Shinobi Nations",
        politicalStructure: "Hidden Village system",
        centralConflict: "Akatsuki threat",
        culturalFlavor: ["Japanese feudal", "Martial arts"],
        environment: "Temperate forests",
        wildcard: "Bijuu sealed in hosts",
      },
      ipContext: null,
    });
  });

  it("geography call has NO 'ALREADY ESTABLISHED' section", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    const firstCallPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(firstCallPrompt).not.toContain("ALREADY ESTABLISHED");
  });

  it("politicalStructure call prompt contains geography value in ALREADY ESTABLISHED section", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    const secondCallPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>).prompt as string;
    expect(secondCallPrompt).toContain("ALREADY ESTABLISHED");
    expect(secondCallPrompt).toContain("Five Great Shinobi Nations");
  });

  it("centralConflict call prompt contains both geography AND politicalStructure", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    const thirdCallPrompt = (mockGenerateObject.mock.calls[2]![0] as Record<string, unknown>).prompt as string;
    expect(thirdCallPrompt).toContain("ALREADY ESTABLISHED");
    expect(thirdCallPrompt).toContain("Five Great Shinobi Nations");
    expect(thirdCallPrompt).toContain("Hidden Village system");
  });

  it("6th call (wildcard) prompt contains all 5 previous results", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    const sixthCallPrompt = (mockGenerateObject.mock.calls[5]![0] as Record<string, unknown>).prompt as string;
    expect(sixthCallPrompt).toContain("Five Great Shinobi Nations");
    expect(sixthCallPrompt).toContain("Hidden Village system");
    expect(sixthCallPrompt).toContain("Akatsuki threat");
    expect(sixthCallPrompt).toContain("Japanese feudal");
    expect(sixthCallPrompt).toContain("Temperate forests");
  });

  it("known IP premise includes franchise name and canonical instruction", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole, ipContext: fakeIpContext });

    // Check first call has IP context
    const firstCallPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(firstCallPrompt).toContain("Naruto");
    expect(firstCallPrompt).toContain("canonical");
  });

  it("original world premise includes original world instruction", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "A volcanic island world", role: fakeRole });

    const firstCallPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(firstCallPrompt).toContain("original world");
  });

  it("each call prompt includes stop-slop rules", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    for (let i = 0; i < 6; i++) {
      const prompt = (mockGenerateObject.mock.calls[i]![0] as Record<string, unknown>).prompt as string;
      expect(prompt).toContain("WRITING RULES");
      expect(prompt).toContain("BANNED words");
    }
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

  it("includes stop-slop rules in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: { value: "Test value" } });

    await suggestSingleSeed({
      premise: "Test premise",
      role: fakeRole,
      category: "geography",
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("WRITING RULES");
  });

  it("includes IP context when provided", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: { value: "Ninja villages" } });

    await suggestSingleSeed({
      premise: "Naruto world",
      role: fakeRole,
      category: "geography",
      ipContext: fakeIpContext,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("FRANCHISE REFERENCE");
    expect(prompt).toContain("Naruto");
  });
});
