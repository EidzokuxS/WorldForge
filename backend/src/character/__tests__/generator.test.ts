import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import {
  generateCharacter,
  generateCharacterFromArchetype,
  mapV2CardToCharacter,
  parseCharacterDescription,
} from "../generator.js";

const fakeRole = {
  provider: {
    id: "test",
    name: "Test Provider",
    baseUrl: "https://example.com",
    apiKey: "sk-test",
    model: "gpt-4",
  },
  temperature: 0.7,
  maxTokens: 2048,
};

const fakeCharacter = {
  name: "Kael",
  race: "Human",
  gender: "Male",
  age: "Young adult",
  appearance: "Tall with dark hair.",
  backgroundSummary: "A veteran soldier from the northern campaigns.",
  personaSummary: "Stoic but loyal, speaks plainly.",
  tags: ["Brave", "Swordsman", "Scarred"],
  drives: ["Protect the weak"],
  frictions: ["Haunted by past failures"],
  shortTermGoals: ["Find shelter"],
  longTermGoals: ["Reclaim homeland"],
  hp: 5,
  equippedItems: ["Iron Sword"],
  locationName: "Ironhaven",
};

/** Legacy flat shape returned by V2 import path. */
const fakeLegacyCharacter = {
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
  it("returns a canonical character draft while preserving explicit authored profile fields", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...fakeCharacter,
        name: "{{user}} Bloodthorn",
        race: "Human",
        gender: "Female",
        age: "18",
        appearance: "Violet eyes with silver flecks and raven hair.",
        backgroundSummary: "Born in the highlands.",
        personaSummary: "Fierce and independent.",
      },
    });

    const result = await parseCharacterDescription({
      description: [
        "Full name - {{user}} Bloodthorn",
        "Gender - Female",
        "Age - 18",
        "Species - Human",
        "Appearance - Violet eyes with silver flecks and raven hair.",
      ].join("\n"),
      premise: "Signals whisper through the alpine dark.",
      locationNames: ["Swiss Alpine Signal Listening Station"],
      role: fakeRole,
    });

    expect(result.identity.displayName).toBe("{{user}} Bloodthorn");
    expect(result.profile.gender).toBe("Female");
    expect(result.profile.ageText).toBe("18");
    expect(result.profile.species).toBe("Human");
    expect(result.profile.appearance).toBe(
      "Violet eyes with silver flecks and raven hair.",
    );
    expect(result.provenance.sourceKind).toBe("player-input");

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, provenance");
    expect(prompt).toContain("copy it verbatim");
    expect(prompt).not.toContain("Use the tag-only system");
  });

  it("uses rich schema prompt with backgroundSummary, personaSummary, drives, frictions, and goals", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    await parseCharacterDescription({
      description: "A brave swordsman with a scarred face.",
      premise: "Dark fantasy world.",
      locationNames: ["Ironhaven", "Mistharbor"],
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("backgroundSummary");
    expect(prompt).toContain("personaSummary");
    expect(prompt).toContain("drives");
    expect(prompt).toContain("frictions");
    expect(prompt).toContain("shortTermGoals");
    expect(prompt).toContain("longTermGoals");
    expect(prompt).toContain("Default to 5 for a fresh character");
    expect(prompt).not.toContain("tag-only system");
  });
});

describe("generateCharacter", () => {
  it("uses rich schema and populates background, persona, drives, frictions, and goals", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    const result = await generateCharacter({
      premise: "A steampunk city.",
      locationNames: ["Ironhaven"],
      factionNames: ["The Guild"],
      role: fakeRole,
    });

    expect(result.identity.displayName).toBe("Kael");
    expect(result.profile.backgroundSummary).toBe("A veteran soldier from the northern campaigns.");
    expect(result.profile.personaSummary).toBe("Stoic but loyal, speaks plainly.");
    expect(result.motivations.drives).toEqual(["Protect the weak"]);
    expect(result.motivations.frictions).toEqual(["Haunted by past failures"]);
    expect(result.motivations.shortTermGoals).toEqual(["Find shelter"]);
    expect(result.motivations.longTermGoals).toEqual(["Reclaim homeland"]);
    expect(result.state.hp).toBe(5);

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("A steampunk city.");
    expect(prompt).toContain("The Guild");
    expect(prompt).toContain("backgroundSummary");
    expect(prompt).toContain("personaSummary");
    expect(prompt).toContain("Default to 5 for a fresh character");
    expect(prompt).not.toContain("tag-only system");
  });
});

describe("mapV2CardToCharacter", () => {
  it("keeps import prompts on the shared draft contract and normalizes imported tags", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...fakeLegacyCharacter,
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

    expect(result.capabilities.traits).toEqual(["Mind Controller", "Fearless Operative"]);

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("CHARACTER NAME: Aria");
    expect(prompt).toContain("shared draft pipeline");
    expect(prompt).toContain("Keep outsider/native status");
    expect(prompt).not.toContain("tag-only system");
  });
});

describe("generateCharacterFromArchetype", () => {
  it("includes archetype research while keeping canonical draft vocabulary", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeCharacter });

    await generateCharacterFromArchetype({
      archetype: "Ranger",
      premise: "Wilderness.",
      locationNames: ["Forest"],
      factionNames: [],
      role: fakeRole,
      researchContext: "Rangers are skilled trackers.",
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("ARCHETYPE RESEARCH:");
    expect(prompt).toContain("Rangers are skilled trackers.");
    expect(prompt).toContain("profile");
    expect(prompt).toContain("capabilities");
    expect(prompt).toContain("provenance");
    expect(prompt).not.toContain("tag-only system");
  });
});
