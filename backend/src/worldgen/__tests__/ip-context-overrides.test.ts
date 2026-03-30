import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { applyPremiseCharacterOverrides } from "../ip-context-overrides.js";
import type { IpResearchContext } from "../ip-researcher.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0,
  maxTokens: 512,
};

const baseIpContext: IpResearchContext = {
  franchise: "Voices of the Void",
  keyFacts: [
    "Dr. Kel monitors the signal base and handles most first-contact anomalies.",
    "Maxwell manages logistics for the outpost.",
    "The base sits in a remote valley used for radio astronomy.",
  ],
  tonalNotes: ["lonely", "paranormal", "scientific"],
  canonicalNames: {
    locations: ["Signal Base"],
    factions: ["Research Staff"],
    characters: ["Dr. Kel", "Maxwell"],
  },
  source: "llm",
};

beforeEach(() => {
  mockGenerateObject.mockReset();
});

describe("applyPremiseCharacterOverrides", () => {
  it("delegates premise analysis to structured divergence without changing the canonical context", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "diverged",
        protagonistRole: {
          kind: "custom",
          interpretation: "replacement",
          canonicalCharacterName: "Dr. Kel",
          roleSummary: "The player replaces Dr. Kel as the active station operator.",
        },
        preservedCanonFacts: ["The signal base remains active."],
        changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
        currentStateDirectives: ["Treat the player as the newly arrived operator."],
        ambiguityNotes: [],
      },
    });

    const result = await applyPremiseCharacterOverrides(
      baseIpContext,
      "Voices of the Void, but I'm playing with my own character instead of Dr Kel",
      fakeRole as never,
    );

    expect(result).toBe(baseIpContext);
    expect(result?.canonicalNames?.characters).toEqual(["Dr. Kel", "Maxwell"]);
    expect(result?.keyFacts).toEqual(baseIpContext.keyFacts);
    expect(result?.excludedCharacters).toBeUndefined();
  });

  it("preserves legacy excludedCharacters cache instead of recomputing canon pruning", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        mode: "diverged",
        protagonistRole: {
          kind: "custom",
          interpretation: "replacement",
          canonicalCharacterName: "Dr. Kel",
          roleSummary: "The player replaces Dr. Kel as the active station operator.",
        },
        preservedCanonFacts: ["The signal base remains active."],
        changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
        currentStateDirectives: ["Treat the player as the newly arrived operator."],
        ambiguityNotes: [],
      },
    });

    const legacyContext: IpResearchContext = {
      ...baseIpContext,
      excludedCharacters: ["Dr. Kel"],
    };

    const result = await applyPremiseCharacterOverrides(
      legacyContext,
      "My OC is here instead of Dr Kel",
      fakeRole as never,
    );

    expect(result).toBe(legacyContext);
    expect(result?.excludedCharacters).toEqual(["Dr. Kel"]);
    expect(result?.canonicalNames?.characters).toEqual(["Dr. Kel", "Maxwell"]);
    expect(result?.keyFacts).toEqual(baseIpContext.keyFacts);
  });

  it("returns null without invoking divergence interpretation when no IP context is provided", async () => {
    const result = await applyPremiseCharacterOverrides(
      null,
      "I've just arrived at the base and I'm meeting the crew for the first time",
      fakeRole as never,
    );

    expect(result).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});
