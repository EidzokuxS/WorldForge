import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import {
  generateNpcFromArchetype,
  mapV2CardToNpc,
  parseNpcDescription,
} from "../npc-generator.js";

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

const fakeNpc = {
  name: "Grom",
  race: "Human",
  gender: "Male",
  age: "Middle-aged",
  appearance: "Broad-shouldered with soot-darkened arms.",
  backgroundSummary: "A respected blacksmith whose forge quietly doubles as a meeting point for old war allies.",
  personaSummary: "Gruff and unsentimental at first glance, but fiercely protective of people he considers his own.",
  tags: ["Blacksmith", "Gruff", "Secretive"],
  drives: ["Protect the last people he still trusts"],
  frictions: ["Falls back on suspicion whenever war memories flare up"],
  shortTermGoals: ["Forge a legendary blade"],
  longTermGoals: ["Avenge his family"],
  locationName: "Ironhaven",
  factionName: null,
};

beforeEach(() => {
  mockGenerateObject.mockClear();
});

describe("parseNpcDescription", () => {
  it("returns a canonical npc draft and uses shared field-group wording", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeNpc });

    const result = await parseNpcDescription({
      description: "A gruff blacksmith.",
      premise: "Dark fantasy.",
      locationNames: ["Ironhaven"],
      factionNames: ["The Guild"],
      role: fakeRole,
    });

    expect(result.identity.role).toBe("npc");
    expect(result.identity.displayName).toBe("Grom");
    expect(result.identity.baseFacts?.biography).toContain("blacksmith");
    expect(result.identity.behavioralCore?.motives).toEqual([
      "Protect the last people he still trusts",
    ]);
    expect(result.identity.liveDynamics?.activeGoals).toEqual([
      "Forge a legendary blade",
      "Avenge his family",
    ]);
    expect(result.motivations.shortTermGoals).toEqual(["Forge a legendary blade"]);

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, provenance");
    expect(prompt).toContain("baseFacts + behavioralCore define who the character is");
    expect(prompt).toContain("liveDynamics records earned campaign change");
    expect(prompt).toContain("socialContext");
    expect(prompt).toContain("motivations");
    expect(prompt).toContain("sourceBundle");
    expect(prompt).not.toContain("persona/tags/goals/location/faction");
  });
});

describe("mapV2CardToNpc", () => {
  it("keeps NPC import prompts on the shared contract and normalizes noisy tags", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...fakeNpc,
        tags: ["[Remote Researcher]", "pattern_analysis", "offworld-origin", "nsfw"],
      },
    });

    const result = await mapV2CardToNpc({
      name: "Grom",
      description: "A blacksmith.",
      personality: "Gruff.",
      scenario: "In a forge.",
      v2Tags: ["male"],
      importMode: "outsider",
      premise: "Fantasy.",
      locationNames: ["Ironhaven"],
      factionNames: [],
      role: fakeRole,
    });

    expect(result.capabilities.traits).toEqual([
      "Remote Researcher",
      "Pattern Analysis",
    ]);
    expect(result.sourceBundle?.secondarySources).toHaveLength(4);
    expect(result.continuity?.identityInertia).toBe("anchored");

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("CHARACTER NAME: Grom");
    expect(prompt).toContain("shared draft pipeline");
    expect(prompt).toContain("secondary cues");
    expect(prompt).toContain("sourceBundle");
    expect(prompt).toContain("continuity");
    expect(prompt).not.toContain("persona/tags/goals/location/faction");
  });
});

describe("generateNpcFromArchetype", () => {
  it("keeps archetype-driven NPC prompts on the same shared contract", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeNpc });

    await generateNpcFromArchetype({
      archetype: "Innkeeper",
      premise: "A medieval town.",
      locationNames: ["Ironhaven"],
      factionNames: ["The Guild"],
      role: fakeRole,
      researchContext: "Innkeepers hear all rumors.",
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("ARCHETYPE RESEARCH:");
    expect(prompt).toContain("Innkeepers hear all rumors.");
    expect(prompt).toContain("profile");
    expect(prompt).toContain("motivations");
    expect(prompt).toContain("socialContext");
    expect(prompt).toContain("Do NOT emit nested baseFacts, behavioralCore, liveDynamics");
    expect(prompt).not.toContain("persona/tags/goals/location/faction");
  });
});
