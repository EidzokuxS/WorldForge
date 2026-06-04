import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { interpretPremiseDivergence } from "../premise-divergence.js";
import { generateRefinedPremiseStep } from "../scaffold-steps/premise-step.js";
import {
  buildPremiseDivergencePromptContract,
  buildPremiseRefinementPromptContract,
} from "../prompt-contracts.js";
import type { IpResearchContext } from "../ip-researcher.js";
import { jjkWithNarutoPowerSystemArtifact } from "./fixtures/jjk-naruto-artifact.js";

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

const forbiddenArtifactPromptPhrases = [
  "This world is the Naruto universe",
  "FRANCHISE REFERENCE",
  "Build the canonical world",
  "Canonical subject",
];

function legacyAuthorityLines(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => (
      line.startsWith("LEGACY IP REFERENCE")
      || line.startsWith("KNOWN-IP GENERATION CONTRACT")
      || line.includes("Use this legacy IP reference")
      || line.includes("Start from the LEGACY IP REFERENCE")
      || line.includes("LEGACY IP REFERENCE + PREMISE DIVERGENCE")
    ));
}

describe("interpretPremiseDivergence", () => {
  it("has a premise-divergence prompt contract with exact shape and no backend canon inference", () => {
    const contract = buildPremiseDivergencePromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: premise-divergence.v1");
    expect(contract).toContain("Required fields");
    expect(contract).toContain("protagonistRole");
    expect(contract).toContain("preservedCanonFacts");
    expect(contract).toContain("currentStateDirectives");
    expect(contract).toContain("Caps:");
    expect(contract).toContain("nullable");
    expect(contract).toContain("Valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain("Invalid example:");
    expect(contract).toContain("backend must not infer premise canon");
  });

  it("returns null without calling the model when legacy IP context is absent", async () => {
    await expect(
      interpretPremiseDivergence(
        null,
        "Jujutsu Kaisen world with Naruto power system",
        fakeRole as never,
      ),
    ).resolves.toBeNull();

    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

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
    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: premise-divergence.v1");
    expect(prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: premise-divergence.v1")).toBeLessThan(
      prompt.indexOf("FRANCHISE:"),
    );
    expect(prompt).toContain("backend must not infer premise canon");
    expect(prompt).toContain("Caps:");
    expect(prompt).toContain("Minimal valid output:");
    expect(prompt).toContain("Invalid example:");
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

describe("generateRefinedPremiseStep research artifact prompt boundary", () => {
  const fakeReq = {
    campaignId: "campaign-1",
    name: "Test World",
    premise: "Jujutsu Kaisen world with Naruto power system",
    role: fakeRole,
  };

  it("has a premise-refinement prompt contract with explicit text fallback boundary", () => {
    const contract = buildPremiseRefinementPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: premise-refinement.v1");
    expect(contract).toContain("Required fields");
    expect(contract).toContain("refinedPremise");
    expect(contract).toContain("Caps:");
    expect(contract).toContain("nullable");
    expect(contract).toContain("Valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain("Invalid example:");
    expect(contract).toContain("text-only compatibility fallback");
    expect(contract).toContain("backend must not infer premise canon");
  });

  it("uses artifact source rules with null ipContext instead of legacy franchise wording", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        refinedPremise:
          "Tokyo Jujutsu High anchors a modern occult world while chakra-style control changes how sorcerers train and fight.",
      },
    });

    await generateRefinedPremiseStep(
      {
        ...fakeReq,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      } as never,
      null,
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: premise-refinement.v1");
    expect(prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: premise-refinement.v1")).toBeLessThan(
      prompt.indexOf("PLAYER CONCEPT:"),
    );
    expect(prompt).toContain("text-only compatibility fallback");
    expect(prompt).toContain("backend must not infer premise canon");
    expect(prompt).toContain("Caps:");
    expect(prompt).toContain("Minimal valid output:");
    expect(prompt).toContain("Invalid example:");
    expect(prompt).toContain("RESEARCH CONTEXT FOR REFINED PREMISE");
    expect(prompt).toContain("Source usage rules:");
    expect(prompt).toContain("Jujutsu Kaisen: role=world_basis");
    expect(prompt).toContain("useFor=locations, factions, npcs, timeline");
    expect(prompt).toContain("Naruto: role=mechanics_overlay");
    expect(prompt).toContain("useFor=power_system");
    for (const phrase of forbiddenArtifactPromptPhrases) {
      expect(prompt).not.toContain(phrase);
    }
  });

  it("keeps legacy no-artifact known-IP premise prompt authority wording stable", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        refinedPremise:
          "Konohagakure remains the central shinobi village while Naruto's canon cast and institutions stay intact.",
      },
    });

    await generateRefinedPremiseStep(
      {
        ...fakeReq,
        premise: "Naruto world",
        researchArtifact: null,
        premiseDivergence: {
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
      } as never,
      narutoContext,
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(legacyAuthorityLines(prompt)).toMatchInlineSnapshot(`
      [
        "LEGACY IP REFERENCE (Naruto, verified via mcp):",
        "1. Use this legacy IP reference as selected source context, with targeted modifications from the premise.",
        "KNOWN-IP GENERATION CONTRACT FOR REFINED PREMISE:",
        "- Start from the LEGACY IP REFERENCE as the explicit selected source baseline for Naruto.",
        "3. For known IPs: summarize the present world state by combining LEGACY IP REFERENCE + PREMISE DIVERGENCE. Do not fall back to a blind source synopsis or reintroduce changed facts.",
      ]
    `);
  });
});
