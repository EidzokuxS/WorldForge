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
});
