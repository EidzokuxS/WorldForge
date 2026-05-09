import { describe, expect, it } from "vitest";
import type { CharacterPersonality } from "@worldforge/shared";
import {
  mapFlatPersonalityToNested,
  personalityFieldSchema,
} from "../personality-schema.js";

describe("personalityFieldSchema", () => {
  it("parses a fully-populated flat object round-trip", () => {
    const flat = {
      personalitySummary: "A cautious scholar",
      personalityVoice: "Clipped, formal, prefers understatement",
      personalityDecisionStyle: "Weighs options before committing",
      personalityWorldview: "Order through careful scholarship",
      personalityContradictions: ["Preaches humility but hoards secrets"],
      personalityMythology: "Keeper of forbidden knowledge",
      personalitySampleLines: [
        "Patience, patience - the pages tell more than the hand.",
        "I have read this twice and still it mocks me.",
      ],
    };

    const parsed = personalityFieldSchema.parse(flat);

    expect(parsed).toEqual(flat);
  });

  it("applies defaults when fields are omitted", () => {
    const parsed = personalityFieldSchema.parse({});

    expect(parsed.personalitySummary).toBe("");
    expect(parsed.personalityVoice).toBe("");
    expect(parsed.personalityDecisionStyle).toBe("");
    expect(parsed.personalityWorldview).toBe("");
    expect(parsed.personalityContradictions).toEqual([]);
    expect(parsed.personalityMythology).toBe("");
    expect(parsed.personalitySampleLines).toEqual([]);
  });

  it("rejects contradictions.length > 3", () => {
    expect(() =>
      personalityFieldSchema.parse({
        personalityContradictions: ["a", "b", "c", "d"],
      }),
    ).toThrow();
  });

  it("rejects sampleLines.length > 3", () => {
    expect(() =>
      personalityFieldSchema.parse({
        personalitySampleLines: ["one", "two", "three", "four"],
      }),
    ).toThrow();
  });
});

describe("mapFlatPersonalityToNested", () => {
  it("maps all 7 flat fields into CharacterPersonality nested shape", () => {
    const flat = {
      personalitySummary: "Summary text",
      personalityVoice: "Voice text",
      personalityDecisionStyle: "Decision style text",
      personalityWorldview: "Worldview text",
      personalityContradictions: ["Contradiction one"],
      personalityMythology: "Mythology text",
      personalitySampleLines: ["Line one", "Line two"],
    };

    const nested: CharacterPersonality = mapFlatPersonalityToNested(flat);

    expect(nested).toEqual({
      summary: "Summary text",
      voice: "Voice text",
      decisionStyle: "Decision style text",
      worldview: "Worldview text",
      internalContradictions: ["Contradiction one"],
      personalMythology: "Mythology text",
      sampleLines: ["Line one", "Line two"],
    });
  });
});
