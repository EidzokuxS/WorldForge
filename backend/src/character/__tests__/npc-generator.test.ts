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
  parseNpcDescription,
} from "../npc-generator.js";
import {
  DETERMINISTIC_MAPPING_RULE,
  FLAT_OUTPUT_ADAPTER_RULE,
  RICHER_IDENTITY_TRUTH_RULE,
} from "../prompt-contract.js";

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
  personalitySummary: "A protector who hides loyalty behind iron-hard reserve.",
  personalityVoice: "Blunt, workmanlike, and allergic to ornament.",
  personalityDecisionStyle: "Tests people quietly, then commits without fanfare.",
  personalityWorldview: "Trust is earned through labor and consistency.",
  personalityContradictions: ["Claims to want solitude, but keeps rebuilding a community around his forge."],
  personalityMythology: "If the fire stays lit, so do the people depending on it.",
  personalitySampleLines: ["Talk less. Hold the tongs steady.", "If you want trust, show up tomorrow too."],
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
    expect(result.identity.personality).toMatchObject({
      summary: "A protector who hides loyalty behind iron-hard reserve.",
      voice: "Blunt, workmanlike, and allergic to ornament.",
    });
    expect(result.identity.liveDynamics?.activeGoals).toEqual([
      "Forge a legendary blade",
      "Avenge his family",
    ]);
    expect(result.motivations.shortTermGoals).toEqual(["Forge a legendary blade"]);

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: npc-character.v1");
    expect(prompt).toContain("Minimal valid output");
    expect(prompt).toContain("Invalid example");
    expect(prompt).toContain("Do not invent rigid player motivations");
    expect(prompt).toContain("identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, provenance");
    expect(prompt).toContain(RICHER_IDENTITY_TRUTH_RULE);
    expect(prompt).toContain("liveDynamics records earned campaign change");
    expect(prompt).toContain("socialContext");
    expect(prompt).toContain("motivations");
    expect(prompt).toContain("provenance");
    expect(prompt).not.toContain("persona/tags/goals/location/faction");
  });
});

// describe("mapV2CardToNpc") removed in Phase 60-04: mapV2CardToNpc was deleted.
// V2 import for NPCs is now handled by the ingestion pipeline via
// synthesizeDraftFromSources (shared with players) and proven at the HTTP
// layer by routes/__tests__/character.test.ts with role="key".

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
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: npc-character.v1");
    expect(prompt).toContain("ARCHETYPE RESEARCH:");
    expect(prompt).toContain("Innkeepers hear all rumors.");
    expect(prompt).toContain("profile");
    expect(prompt).toContain("motivations");
    expect(prompt).toContain("socialContext");
    expect(prompt).toContain(FLAT_OUTPUT_ADAPTER_RULE);
    expect(prompt).toContain(DETERMINISTIC_MAPPING_RULE);
    expect(prompt).not.toContain("persona/tags/goals/location/faction");
  });
});
