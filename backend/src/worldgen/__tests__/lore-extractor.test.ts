import { beforeEach, describe, it, expect, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
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
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

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

  it("grounds lore extraction in political divergence while preserving untouched canon", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { loreCards: fakeLoreCards },
    });

    await extractLoreCards(
      fakeScaffold,
      fakeRole,
      undefined,
      {
        franchise: "Naruto",
        keyFacts: [
          "Konohagakure is one of the Five Great Shinobi Villages.",
          "Naruto Uzumaki remains the Seventh Hokage.",
        ],
        tonalNotes: ["Shonen action"],
        canonicalNames: {
          locations: ["Konohagakure"],
          factions: ["Konohagakure", "Otogakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno", "Orochimaru"],
        },
        source: "mcp",
      },
      {
        mode: "diverged",
        protagonistRole: {
          kind: "canonical",
          interpretation: "unknown",
          canonicalCharacterName: null,
          roleSummary: "The canon protagonist slot is unchanged.",
        },
        preservedCanonFacts: ["Naruto Uzumaki remains the Seventh Hokage."],
        changedCanonFacts: ["Sakura Haruno trained under Orochimaru instead of Tsunade."],
        currentStateDirectives: [
          "Describe only the institutions, relationships, and abilities that this altered training would realistically change.",
          "Keep unrelated Leaf Village canon intact.",
        ],
        ambiguityNotes: [],
      },
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("PRESERVED CANON FACTS");
    expect(prompt).toContain("Naruto Uzumaki remains the Seventh Hokage.");
    expect(prompt).toContain("CHANGED CANON FACTS");
    expect(prompt).toContain("Sakura Haruno trained under Orochimaru instead of Tsunade.");
    expect(prompt).toContain("CURRENT WORLD-STATE DIRECTIVES");
    expect(prompt).toContain("Keep unrelated Leaf Village canon intact.");
  });

  it("keeps canonical Star Wars institutions explicit when Order 66 fails", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { loreCards: fakeLoreCards },
    });

    await extractLoreCards(
      fakeScaffold,
      fakeRole,
      undefined,
      {
        franchise: "Star Wars",
        keyFacts: [
          "The Galactic Republic commands clone armies during the Clone Wars.",
          "The Jedi Order serves as peacekeepers across the Republic.",
          "Coruscant is the political capital of the Republic.",
        ],
        tonalNotes: ["space opera"],
        canonicalNames: {
          locations: ["Coruscant", "Mustafar", "Utapau"],
          factions: ["Galactic Republic", "Jedi Order", "Separatist Alliance"],
          characters: ["Anakin Skywalker", "Obi-Wan Kenobi", "Palpatine", "Yoda"],
        },
        source: "mcp",
      },
      {
        mode: "diverged",
        protagonistRole: {
          kind: "canonical",
          interpretation: "canonical",
          canonicalCharacterName: null,
          roleSummary: "Saga protagonists remain canon figures.",
        },
        preservedCanonFacts: [
          "Coruscant remains the political capital of the Republic.",
          "The Galactic Republic still commands clone armies during the Clone Wars.",
        ],
        changedCanonFacts: [
          "Order 66 failed, so the Jedi Order remains an organized political and military force.",
        ],
        currentStateDirectives: [
          "Keep canonical planets, factions, and leaders unless the failed purge would directly change them.",
          "Describe the Republic and Jedi as embattled but still publicly active powers.",
        ],
        ambiguityNotes: [],
      },
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("Coruscant remains the political capital of the Republic.");
    expect(prompt).toContain(
      "Order 66 failed, so the Jedi Order remains an organized political and military force.",
    );
    expect(prompt).toContain(
      "Keep canonical planets, factions, and leaders unless the failed purge would directly change them.",
    );
  });
});
