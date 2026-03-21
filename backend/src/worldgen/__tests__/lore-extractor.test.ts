import { describe, it, expect, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { extractLoreCards } from "../lore-extractor.js";
import type { WorldScaffold } from "../types.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.3,
  maxTokens: 4096,
};

const fakeScaffold: WorldScaffold = {
  refinedPremise: "A dark fantasy world of warring kingdoms.",
  locations: [
    {
      name: "Ironhaven",
      description: "A fortified city.",
      tags: ["urban", "military"],
      isStarting: true,
      connectedTo: [],
    },
  ],
  factions: [
    {
      name: "The Crown",
      tags: ["noble", "military"],
      goals: ["Expand territory"],
      assets: ["Royal army"],
      territoryNames: ["Ironhaven"],
    },
  ],
  npcs: [
    {
      name: "Lord Varn",
      persona: "A ruthless commander.",
      tags: ["Commander", "Ruthless"],
      goals: { shortTerm: ["Secure the borders"], longTerm: ["Conquer the south"] },
      locationName: "Ironhaven",
      factionName: "The Crown",
    },
  ],
  loreCards: [],
};

const fakeLoreCards = [
  { term: "Ironhaven", definition: "A fortified city.", category: "location" as const },
  { term: "The Crown", definition: "A noble faction.", category: "faction" as const },
];

describe("extractLoreCards", () => {
  it("returns lore cards from generateObject", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { loreCards: fakeLoreCards },
    });

    const result = await extractLoreCards(fakeScaffold, fakeRole);
    expect(result).toEqual(fakeLoreCards);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("includes scaffold context in the prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { loreCards: [] },
    });

    await extractLoreCards(fakeScaffold, fakeRole);

    const callArgs = mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>;
    const prompt = callArgs.prompt as string;
    expect(prompt).toContain("Ironhaven");
    expect(prompt).toContain("The Crown");
    expect(prompt).toContain("Lord Varn");
    expect(prompt).toContain("A dark fantasy world");
  });
});
