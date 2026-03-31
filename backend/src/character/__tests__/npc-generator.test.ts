import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import {
  parseNpcDescription,
  mapV2CardToNpc,
  generateNpcFromArchetype,
} from "../npc-generator.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

const fakeNpc = {
  name: "Grom",
  persona: "A gruff blacksmith with a secret past.",
  tags: ["Blacksmith", "Gruff", "Secretive"],
  goals: { shortTerm: ["Forge a legendary blade"], longTerm: ["Avenge his family"] },
  locationName: "Ironhaven",
  factionName: null,
};

beforeEach(() => {
  mockGenerateObject.mockClear();
});

describe("parseNpcDescription", () => {
  it("returns parsed NPC from generateObject", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeNpc });

    const result = await parseNpcDescription({
      description: "A gruff blacksmith.",
      premise: "Dark fantasy.",
      locationNames: ["Ironhaven"],
      factionNames: ["The Guild"],
      role: fakeRole,
    });

    expect(result).toEqual(fakeNpc);
    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("A gruff blacksmith.");
    expect(prompt).toContain("Ironhaven");
  });
});

describe("mapV2CardToNpc", () => {
  it("converts V2 card to NPC format", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeNpc });

    const result = await mapV2CardToNpc({
      name: "Grom",
      description: "A blacksmith.",
      personality: "Gruff.",
      scenario: "In a forge.",
      v2Tags: ["male"],
      importMode: "native",
      premise: "Fantasy.",
      locationNames: ["Ironhaven"],
      factionNames: [],
      role: fakeRole,
    });

    expect(result.name).toBe("Grom");
    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("CHARACTER NAME: Grom");
    expect(prompt).toContain("IMPORT MODE: native resident.");
  });

  it("normalizes noisy imported NPC tags", async () => {
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

    expect(result.tags).toEqual(["Remote Researcher", "Pattern Analysis"]);
  });
});

describe("generateNpcFromArchetype", () => {
  it("includes research context in prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeNpc });

    await generateNpcFromArchetype({
      archetype: "Innkeeper",
      premise: "A medieval town.",
      locationNames: ["Ironhaven"],
      factionNames: ["The Guild"],
      role: fakeRole,
      researchContext: "Innkeepers hear all rumors.",
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("ARCHETYPE RESEARCH:");
    expect(prompt).toContain("Innkeepers hear all rumors.");
  });

  it("omits research block when context is absent", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: fakeNpc });

    await generateNpcFromArchetype({
      archetype: "Innkeeper",
      premise: "A town.",
      locationNames: ["Ironhaven"],
      factionNames: [],
      role: fakeRole,
    });

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>).prompt as string;
    expect(prompt).not.toContain("ARCHETYPE RESEARCH:");
  });
});
