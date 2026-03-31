import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import {
  parseCharacterDescription,
  generateCharacter,
  mapV2CardToCharacter,
  generateCharacterFromArchetype,
} from "../generator.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

const fakeCharacter = {
  name: "Kael",
  race: "Human",
  gender: "Male",
  age: "Young adult",
  appearance: "Tall with dark hair.",
  tags: ["Brave", "Swordsman", "Scarred"],
  hp: 4,
  equippedItems: ["Iron Sword"],
  locationName: "Ironhaven",
};

beforeEach(() => {
  mockGenerateObject.mockClear();
});

describe("parseCharacterDescription", () => {
  it("returns parsed character from generateObject", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    const result = await parseCharacterDescription({
      description: "A brave swordsman with a scarred face.",
      premise: "Dark fantasy world.",
      locationNames: ["Ironhaven", "Mistharbor"],
      role: fakeRole,
    });

    expect(result).toEqual(fakeCharacter);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.model).toBe("mock-model");
    expect(callArgs.prompt).toContain("Dark fantasy world.");
    expect(callArgs.prompt).toContain("A brave swordsman");
  });
});

describe("generateCharacter", () => {
  it("generates a character with premise and locations", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    const result = await generateCharacter({
      premise: "A steampunk city.",
      locationNames: ["Ironhaven"],
      factionNames: ["The Guild"],
      role: fakeRole,
    });

    expect(result.name).toBe("Kael");
    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("A steampunk city.");
    expect(prompt).toContain("Ironhaven");
    expect(prompt).toContain("The Guild");
  });
});

describe("mapV2CardToCharacter", () => {
  it("converts a V2 card using buildV2CardSections", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    const result = await mapV2CardToCharacter({
      name: "Aria",
      description: "A wandering bard.",
      personality: "Cheerful.",
      scenario: "Lost.",
      v2Tags: ["female"],
      importMode: "native",
      premise: "Fantasy.",
      locationNames: ["Ironhaven"],
      role: fakeRole,
    });

    expect(result.name).toBe("Kael");
    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("CHARACTER NAME: Aria");
    expect(prompt).toContain("IMPORT MODE: native resident.");
  });

  it("normalizes imported tags into worldforge house style", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...fakeCharacter,
        tags: ["[mind-controller]", "fearless-operative", "female", "offworld-origin"],
      },
    });

    const result = await mapV2CardToCharacter({
      name: "Aria",
      description: "A wandering bard.",
      personality: "Cheerful.",
      scenario: "Lost.",
      v2Tags: ["female"],
      importMode: "outsider",
      premise: "Fantasy.",
      locationNames: ["Ironhaven"],
      role: fakeRole,
    });

    expect(result.tags).toEqual(["Mind Controller", "Fearless Operative"]);
  });
});

describe("generateCharacterFromArchetype", () => {
  it("includes research context when provided", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    await generateCharacterFromArchetype({
      archetype: "Ranger",
      premise: "Wilderness.",
      locationNames: ["Forest"],
      factionNames: [],
      role: fakeRole,
      researchContext: "Rangers are skilled trackers.",
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("ARCHETYPE RESEARCH:");
    expect(prompt).toContain("Rangers are skilled trackers.");
  });

  it("omits research block when no context", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    await generateCharacterFromArchetype({
      archetype: "Ranger",
      premise: "Wilderness.",
      locationNames: ["Forest"],
      factionNames: [],
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).not.toContain("ARCHETYPE RESEARCH:");
  });
});
