import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
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

const starWarsIpContext: IpResearchContext = {
  franchise: "Star Wars",
  keyFacts: [
    "The Galactic Republic commands clone armies during the Clone Wars.",
    "The Jedi Order serves as peacekeepers across the Republic.",
    "Coruscant is the political capital of the Republic.",
  ],
  tonalNotes: ["space opera", "mythic conflict"],
  canonicalNames: {
    locations: ["Coruscant", "Mustafar", "Utapau"],
    factions: ["Galactic Republic", "Jedi Order", "Separatist Alliance"],
    characters: ["Anakin Skywalker", "Obi-Wan Kenobi", "Palpatine", "Yoda"],
  },
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
      premiseDivergence: null,
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
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "canonical",
        protagonistRole: {
          kind: "canonical",
          interpretation: "canonical",
          canonicalCharacterName: null,
          roleSummary: "The canon protagonist slot is unchanged.",
        },
        preservedCanonFacts: ["Naruto Uzumaki remains the canon protagonist of Konohagakure."],
        changedCanonFacts: [],
        currentStateDirectives: ["Keep the canon cast intact."],
        ambiguityNotes: [],
      },
    });
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole, ipContext: fakeIpContext });

    // Call 0 is premise override analysis, call 1 is the first DNA generation prompt.
    const firstGenerationPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>).prompt as string;
    expect(firstGenerationPrompt).toContain("Naruto");
    expect(firstGenerationPrompt).toContain("canonical");
  });

  it("returns structured premiseDivergence without mutating canonical ipContext", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "diverged",
        protagonistRole: {
          kind: "custom",
          interpretation: "replacement",
          canonicalCharacterName: "Dr. Kel",
          roleSummary: "The player's custom character replaces Dr. Kel as the active station operator.",
        },
        preservedCanonFacts: ["The signal base remains active."],
        changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
        currentStateDirectives: ["Treat the player as the newly arrived operator."],
        ambiguityNotes: [],
      },
    });
    setupSequentialMocks();

    const ipContext = {
      franchise: "Voices of the Void",
      keyFacts: [
        "Dr. Kel runs the station.",
        "Maxwell handles supply runs.",
      ],
      tonalNotes: ["weird science"],
      canonicalNames: {
        locations: ["Signal Base"],
        factions: ["Research Staff"],
        characters: ["Dr. Kel", "Maxwell"],
      },
      source: "llm" as const,
    };

    const result = await suggestWorldSeeds({
      premise: "Voices of the Void, but I'm playing with my own char instead off Dr Kel",
      role: fakeRole,
      ipContext,
    });

    expect(result.premiseDivergence).toMatchObject({
      mode: "diverged",
      protagonistRole: {
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
      },
    });
    expect(result.ipContext).toEqual(ipContext);
    expect(result.ipContext?.canonicalNames?.characters).toEqual(["Dr. Kel", "Maxwell"]);
    expect(result.ipContext?.keyFacts).toContain("Dr. Kel runs the station.");
  });

  it("injects preserved canon facts and divergence directives into known-IP DNA prompts", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({
      premise: "Naruto, but Sakura was trained by Orochimaru.",
      role: fakeRole,
      ipContext: {
        ...fakeIpContext,
        keyFacts: [
          "Konohagakure remains one of the Five Great Shinobi Villages.",
          "Naruto Uzumaki is the Seventh Hokage.",
        ],
        canonicalNames: {
          locations: ["Konohagakure", "Otogakure"],
          factions: ["Konohagakure", "Otogakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno", "Orochimaru"],
        },
      },
      premiseDivergence: {
        mode: "diverged",
        protagonistRole: {
          kind: "canonical",
          interpretation: "unknown",
          canonicalCharacterName: null,
          roleSummary: "Canon protagonist roles remain intact.",
        },
        preservedCanonFacts: [
          "Konohagakure remains one of the Five Great Shinobi Villages.",
          "Naruto Uzumaki is the Seventh Hokage.",
        ],
        changedCanonFacts: [
          "Sakura Haruno trained under Orochimaru instead of Tsunade.",
        ],
        currentStateDirectives: [
          "Preserve the wider Naruto canon unless Sakura's altered training directly changes it.",
          "Reflect Orochimaru's influence on Sakura's present relationships and skill set.",
        ],
        ambiguityNotes: [],
      },
    });

    const firstCallPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(firstCallPrompt).toContain("PRESERVED CANON FACTS");
    expect(firstCallPrompt).toContain("Naruto Uzumaki is the Seventh Hokage.");
    expect(firstCallPrompt).toContain("CHANGED CANON FACTS");
    expect(firstCallPrompt).toContain("Sakura Haruno trained under Orochimaru instead of Tsunade.");
    expect(firstCallPrompt).toContain("CURRENT WORLD-STATE DIRECTIVES");
    expect(firstCallPrompt).toContain(
      "Preserve the wider Naruto canon unless Sakura's altered training directly changes it.",
    );
  });

  it("continues seed generation when premise divergence interpretation fails", async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error("safeGenerateObject fallback: invalid JSON"))
      .mockRejectedValueOnce(new Error("safeGenerateObject fallback: invalid JSON"))
      .mockResolvedValueOnce({ object: { value: "Five Great Shinobi Nations", reasoning: "Canonical geography" } })
      .mockResolvedValueOnce({ object: { value: "Hidden Village system", reasoning: "Flows from geography" } })
      .mockResolvedValueOnce({ object: { value: "Akatsuki threat", reasoning: "Flows from political structure" } })
      .mockResolvedValueOnce({ object: { value: ["Japanese feudal", "Martial arts"], reasoning: "Cultural roots" } })
      .mockResolvedValueOnce({ object: { value: "Temperate forests", reasoning: "Fire Country terrain" } })
      .mockResolvedValueOnce({ object: { value: "Bijuu sealed in hosts", reasoning: "Unique power system" } });

    const result = await suggestWorldSeeds({
      premise: "Voices of the Void, but I'm playing with my own char instead off Dr Kel",
      role: fakeRole,
      ipContext: {
        franchise: "Voices of the Void",
        keyFacts: ["Dr. Kel runs the station."],
        tonalNotes: ["weird science"],
        canonicalNames: {
          characters: ["Dr. Kel", "Maxwell"],
        },
        source: "llm",
      },
    });

    expect(result.premiseDivergence).toBeNull();
    expect(result.seeds.geography).toBe("Five Great Shinobi Nations");
    expect(mockGenerateObject).toHaveBeenCalledTimes(8);
    expect((mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).maxOutputTokens).toBeUndefined();
    expect((mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>).maxOutputTokens).toBe(8192);
  });

  it("grounds political divergence prompts in preserved Star Wars canon instead of replacing the setting wholesale", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({
      premise: "Star Wars, but Order 66 failed.",
      role: fakeRole,
      ipContext: starWarsIpContext,
      premiseDivergence: {
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
    });

    const firstCallPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(firstCallPrompt).toContain("Coruscant remains the political capital of the Republic.");
    expect(firstCallPrompt).toContain(
      "Order 66 failed, so the Jedi Order remains an organized political and military force.",
    );
    expect(firstCallPrompt).toContain(
      "Keep canonical planets, factions, and leaders unless the failed purge would directly change them.",
    );
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

  it("adds shared character/start guardrails without replacing worldgen helper authority", async () => {
    setupSequentialMocks();

    await suggestWorldSeeds({ premise: "Naruto world", role: fakeRole });

    const firstCallPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(firstCallPrompt).toContain("startConditions");
    expect(firstCallPrompt).toContain("derived runtime tags");
    expect(firstCallPrompt).not.toContain("tag-only system");
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
      premiseDivergence: {
        mode: "canonical",
        protagonistRole: {
          kind: "canonical",
          interpretation: "canonical",
          canonicalCharacterName: null,
          roleSummary: "Canon protagonist roles remain unchanged.",
        },
        preservedCanonFacts: ["Naruto Uzumaki remains the core protagonist of Konohagakure."],
        changedCanonFacts: [],
        currentStateDirectives: ["Keep the canon cast intact."],
        ambiguityNotes: [],
      },
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("FRANCHISE REFERENCE");
    expect(prompt).toContain("Naruto");
  });

  it("computes premiseDivergence for known-IP single-seed prompts when callers omit the cached artifact", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          mode: "coexisting",
          protagonistRole: {
            kind: "custom",
            interpretation: "outsider",
            canonicalCharacterName: null,
            roleSummary: "The player arrives as a newcomer alongside the canon cast.",
          },
          preservedCanonFacts: ["Naruto Uzumaki remains the Nine-Tails jinchuriki of Konohagakure."],
          changedCanonFacts: [],
          currentStateDirectives: [
            "Keep the canon cast intact while introducing the player as a separate newcomer.",
          ],
          ambiguityNotes: [],
        },
      })
      .mockResolvedValueOnce({ object: { value: "Konohagakure remains the central shinobi hub." } });

    await suggestSingleSeed({
      premise: "I arrive in the Naruto world as an outsider.",
      role: fakeRole,
      category: "geography",
      ipContext: {
        ...fakeIpContext,
        canonicalNames: {
          locations: ["Konohagakure"],
          factions: ["Konohagakure"],
          characters: ["Naruto Uzumaki", "Sasuke Uchiha", "Sakura Haruno"],
        },
      },
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    const prompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("CURRENT WORLD-STATE DIRECTIVES");
    expect(prompt).toContain(
      "Keep the canon cast intact while introducing the player as a separate newcomer.",
    );
  });
});
