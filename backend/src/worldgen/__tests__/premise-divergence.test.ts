import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { interpretPremiseDivergence } from "../premise-divergence.js";
import type { IpResearchContext } from "../ip-researcher.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0,
  maxTokens: 512,
};

const voicesOfTheVoidContext: IpResearchContext = {
  franchise: "Voices of the Void",
  keyFacts: [
    "Dr. Kel monitors the signal base and handles first-contact anomalies.",
    "The signal base sits in a remote valley used for radio astronomy.",
  ],
  tonalNotes: ["lonely", "paranormal", "scientific"],
  canonicalNames: {
    locations: ["Signal Base"],
    factions: ["Research Staff"],
    characters: ["Dr. Kel", "Maxwell"],
  },
  source: "llm",
};

const narutoContext: IpResearchContext = {
  franchise: "Naruto",
  keyFacts: [
    "Naruto Uzumaki is the Nine-Tails jinchuriki of Konohagakure.",
    "Konohagakure is one of the Five Great Shinobi Villages.",
  ],
  tonalNotes: ["shonen action", "rivalry", "coming of age"],
  canonicalNames: {
    locations: ["Konohagakure"],
    factions: ["Akatsuki"],
    characters: ["Naruto Uzumaki", "Sasuke Uchiha", "Sakura Haruno"],
  },
  source: "mcp",
};

const starWarsContext: IpResearchContext = {
  franchise: "Star Wars",
  keyFacts: [
    "The Galactic Republic commands clone armies during the Clone Wars.",
    "The Jedi Order serves as peacekeepers across the Republic.",
    "Coruscant is the political capital of the Republic.",
  ],
  tonalNotes: ["space opera", "mythic conflict", "political intrigue"],
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

describe("interpretPremiseDivergence", () => {
  it("returns a diverged artifact for the motivating Voices of the Void replacement premise", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "diverged",
        protagonistRole: {
          kind: "custom",
          interpretation: "replacement",
          canonicalCharacterName: "Dr. Kel",
          roleSummary: "The player's custom character replaces Dr. Kel as the station's active protagonist.",
        },
        preservedCanonFacts: ["The signal base still sits in the same remote valley."],
        changedCanonFacts: ["Dr. Kel is not the active station protagonist in the current campaign state."],
        currentStateDirectives: ["Treat the player character as the newly arrived operator handling anomalies."],
        ambiguityNotes: [],
      },
    });

    const result = await interpretPremiseDivergence(
      voicesOfTheVoidContext,
      "Voices of the Void, but I'm playing with my own char instead of Dr Kel, I've just arrived",
      fakeRole as never,
    );

    expect(result).not.toBeNull();
    expect(result?.mode).toBe("diverged");
    expect(result?.protagonistRole.interpretation).toBe("replacement");
    expect(result?.protagonistRole.canonicalCharacterName).toBe("Dr. Kel");
    expect(result?.preservedCanonFacts).toContain("The signal base still sits in the same remote valley.");
    expect(result?.changedCanonFacts).toContain("Dr. Kel is not the active station protagonist in the current campaign state.");
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect((mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).maxOutputTokens).toBeUndefined();
  });

  it("treats outsider Naruto premises as canonical or coexisting instead of protagonist replacement", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "coexisting",
        protagonistRole: {
          kind: "custom",
          interpretation: "outsider",
          canonicalCharacterName: null,
          roleSummary: "The player is an outsider entering the canon timeline alongside the existing cast.",
        },
        preservedCanonFacts: ["Naruto Uzumaki remains the canon protagonist of Konohagakure."],
        changedCanonFacts: [],
        currentStateDirectives: ["Keep the canon cast intact while introducing the player as a separate newcomer."],
        ambiguityNotes: [],
      },
    });

    const result = await interpretPremiseDivergence(
      narutoContext,
      "I arrive in the Naruto world as an outsider.",
      fakeRole as never,
    );

    expect(result).not.toBeNull();
    expect(["canonical", "coexisting"]).toContain(result!.mode);
    expect(result?.protagonistRole.interpretation).not.toBe("replacement");
    expect(result?.protagonistRole.canonicalCharacterName).toBeNull();
    expect(result?.currentStateDirectives).toContain(
      "Keep the canon cast intact while introducing the player as a separate newcomer.",
    );
  });

  it("captures relationship divergence without suppressing unrelated Naruto canon", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "diverged",
        protagonistRole: {
          kind: "canonical",
          interpretation: "unknown",
          canonicalCharacterName: null,
          roleSummary: "Canon protagonist roles remain intact.",
        },
        preservedCanonFacts: [
          "Naruto Uzumaki remains the Nine-Tails jinchuriki of Konohagakure.",
          "Konohagakure is one of the Five Great Shinobi Villages.",
        ],
        changedCanonFacts: [
          "Sakura Haruno trained under Orochimaru instead of following Tsunade's apprenticeship path.",
        ],
        currentStateDirectives: [
          "Keep the wider Naruto cast and village structure intact.",
          "Reflect Orochimaru's influence on Sakura's present relationships, tactics, and reputation.",
        ],
        ambiguityNotes: [],
      },
    });

    const result = await interpretPremiseDivergence(
      narutoContext,
      "Naruto, but Sakura was trained by Orochimaru.",
      fakeRole as never,
    );

    expect(result?.mode).toBe("diverged");
    expect(result?.protagonistRole.interpretation).toBe("unknown");
    expect(result?.changedCanonFacts).toContain(
      "Sakura Haruno trained under Orochimaru instead of following Tsunade's apprenticeship path.",
    );
    expect(result?.currentStateDirectives).toContain(
      "Keep the wider Naruto cast and village structure intact.",
    );
  });

  it("captures Order 66 failure as a political divergence while preserving Star Wars canon baseline", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "diverged",
        protagonistRole: {
          kind: "canonical",
          interpretation: "canonical",
          canonicalCharacterName: null,
          roleSummary: "The saga's core protagonists remain canon figures.",
        },
        preservedCanonFacts: [
          "Coruscant remains the political capital of the Republic.",
          "The Galactic Republic still commands clone armies during the Clone Wars.",
        ],
        changedCanonFacts: [
          "Order 66 failed, so the Jedi Order remains an organized military and political force.",
          "Palpatine cannot consolidate the Empire through the purge.",
        ],
        currentStateDirectives: [
          "Preserve canonical planets, institutions, and major characters unless the failed purge would directly alter them.",
          "Describe the Republic and Jedi as embattled but still publicly active powers.",
        ],
        ambiguityNotes: [],
      },
    });

    const result = await interpretPremiseDivergence(
      starWarsContext,
      "Star Wars, but Order 66 failed.",
      fakeRole as never,
    );

    expect(result?.mode).toBe("diverged");
    expect(result?.preservedCanonFacts).toContain(
      "Coruscant remains the political capital of the Republic.",
    );
    expect(result?.changedCanonFacts).toContain(
      "Order 66 failed, so the Jedi Order remains an organized military and political force.",
    );
    expect(result?.currentStateDirectives).toContain(
      "Describe the Republic and Jedi as embattled but still publicly active powers.",
    );
  });

  it("returns null instead of throwing when structured output is invalid", async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error("safeGenerateObject fallback: invalid JSON"))
      .mockRejectedValueOnce(new Error("safeGenerateObject fallback: invalid JSON"));

    await expect(
      interpretPremiseDivergence(
        voicesOfTheVoidContext,
        "Voices of the Void, but I'm playing with my own char instead of Dr Kel",
        fakeRole as never,
      ),
    ).resolves.toBeNull();

    expect((mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).maxOutputTokens).toBeUndefined();
    expect((mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>).maxOutputTokens).toBe(8192);
  });

  it("normalizes protagonist kind synonyms instead of failing structured output", async () => {
    mockGenerateObject.mockImplementationOnce(async (input: { schema: { parse: (value: unknown) => unknown } }) => ({
      object: input.schema.parse({
        mode: "diverged",
        protagonistRole: {
          kind: "player character",
          interpretation: "outsider",
          canonicalCharacterName: null,
          roleSummary: "The player arrives as a distinct newcomer.",
        },
        preservedCanonFacts: ["Naruto Uzumaki remains the canon protagonist of Konohagakure."],
        changedCanonFacts: [],
        currentStateDirectives: ["Keep the canon cast intact while introducing the player as a separate newcomer."],
        ambiguityNotes: [],
      }),
    }));

    const result = await interpretPremiseDivergence(
      narutoContext,
      "I arrive in the Naruto world as an outsider.",
      fakeRole as never,
    );

    expect(result?.protagonistRole.kind).toBe("custom");
  });

  it("falls back to custom when the model emits an unknown protagonist kind label", async () => {
    mockGenerateObject.mockImplementationOnce(async (input: { schema: { parse: (value: unknown) => unknown } }) => ({
      object: input.schema.parse({
        mode: "diverged",
        protagonistRole: {
          kind: "inserted lead",
          interpretation: "replacement",
          canonicalCharacterName: "Dr. Kel",
          roleSummary: "The player's custom character displaces the canon lead.",
        },
        preservedCanonFacts: ["The signal base still sits in the same remote valley."],
        changedCanonFacts: ["Dr. Kel is no longer the active station protagonist."],
        currentStateDirectives: ["Treat the player character as the active station operator."],
        ambiguityNotes: [],
      }),
    }));

    const result = await interpretPremiseDivergence(
      voicesOfTheVoidContext,
      "Voices of the Void, but my own character takes over Dr Kel's role.",
      fakeRole as never,
    );

    expect(result?.protagonistRole.kind).toBe("custom");
  });
});
