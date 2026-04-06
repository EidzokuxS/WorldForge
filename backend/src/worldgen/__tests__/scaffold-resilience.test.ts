import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { generateLocationsStep } from "../scaffold-steps/locations-step.js";
import { generateFactionsStep } from "../scaffold-steps/factions-step.js";
import { generateRefinedPremiseStep } from "../scaffold-steps/premise-step.js";

const fakeReq = {
  campaignId: "campaign-1",
  name: "Test World",
  premise: "A decaying observatory on the edge of known space.",
  role: {
    provider: {
      id: "provider-1",
      name: "Test Provider",
      baseUrl: "http://localhost:1234",
      apiKey: "",
      model: "test-model",
    },
    temperature: 0.7,
    maxTokens: 2048,
  },
} as const;

describe("worldgen scaffold step resilience", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateText.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("../scaffold-steps/premise-step.js");
    vi.unmock("../scaffold-steps/locations-step.js");
    vi.unmock("../scaffold-steps/factions-step.js");
    vi.unmock("../scaffold-steps/npcs-step.js");
    vi.unmock("../lore-extractor.js");
    vi.unmock("../ip-researcher.js");
    vi.unmock("../premise-divergence.js");
    vi.unmock("../../lib/index.js");
  });

  it("normalizes missing starting flags instead of failing location generation", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            { name: "Observation Deck", purpose: "Monitors deep-space signals." },
            { name: "Maintenance Tunnels", purpose: "Connects the station's critical systems." },
          ],
        },
      })
      // Per-entity detail calls (1 per location)
      .mockResolvedValueOnce({
        object: {
          description: "A cold ring of windows and consoles aimed at the dark beyond. Operators parse weak signals here while the station listens for impossible transmissions.",
          tags: ["Cold", "Technical", "Exposed"],
          connectedTo: ["Maintenance Tunnels"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description: "Narrow service corridors run behind the walls and beneath the deck plating. Engineers and smugglers both use them when they need to move unseen.",
          tags: ["Claustrophobic", "Industrial", "Hidden"],
          connectedTo: ["Observation Deck"],
        },
      });

    const result = await generateLocationsStep(
      fakeReq,
      fakeReq.premise,
      null,
    );

    expect(result).toHaveLength(2);
    expect(result.filter((loc) => loc.isStarting)).toHaveLength(1);
    expect(result[0]?.isStarting).toBe(true);
  });

  it("accepts a partial faction plan without cancelling the pipeline", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Station Authority",
              purpose: "Controls access, supplies, and official responses to anomalies.",
            },
          ],
        },
      })
      // Per-entity detail call (1 faction)
      .mockResolvedValueOnce({
        object: {
          tags: ["Bureaucratic", "Security-minded"],
          goals: ["Contain knowledge of the anomalous transmissions"],
          assets: ["Security teams", "Communications blackout protocols"],
          territoryNames: ["Observation Deck"],
        },
      });

    const result = await generateFactionsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck", "Maintenance Tunnels"],
      null,
    );

    expect(result).toEqual([
      expect.objectContaining({
        name: "Station Authority",
        territoryNames: ["Observation Deck"],
      }),
    ]);
  });

  it("grounds refined premise prompts in preserved canon plus divergence consequences", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        refinedPremise:
          "Konohagakure remains the central shinobi power, but Sakura now operates with Orochimaru's methods and alliances. The village's balance of trust and suspicion has shifted around that single divergence.",
      },
    });

    await generateRefinedPremiseStep(
      {
        ...fakeReq,
        premise: "Naruto, but Sakura was trained by Orochimaru.",
        premiseDivergence: {
          mode: "diverged",
          protagonistRole: {
            kind: "canonical",
            interpretation: "unknown",
            canonicalCharacterName: null,
            roleSummary: "The canon protagonist slot is unchanged.",
          },
          preservedCanonFacts: [
            "Konohagakure remains one of the Five Great Shinobi Villages.",
            "Naruto Uzumaki is the Seventh Hokage.",
          ],
          changedCanonFacts: [
            "Sakura Haruno trained under Orochimaru instead of Tsunade.",
          ],
          currentStateDirectives: [
            "Describe the village as it exists after Sakura's altered training reshaped key relationships.",
            "Keep unrelated canon institutions and leadership intact unless the divergence explicitly changes them.",
          ],
          ambiguityNotes: [],
        },
      },
      {
        franchise: "Naruto",
        keyFacts: [
          "Konohagakure remains one of the Five Great Shinobi Villages.",
          "Naruto Uzumaki is the Seventh Hokage.",
        ],
        tonalNotes: ["Shonen action"],
        canonicalNames: {
          locations: ["Konohagakure", "Otogakure"],
          factions: ["Konohagakure", "Otogakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno", "Orochimaru"],
        },
        source: "mcp",
      },
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("PRESERVED CANON FACTS");
    expect(prompt).toContain("CHANGED CANON FACTS");
    expect(prompt).toContain("CURRENT WORLD-STATE DIRECTIVES");
    expect(prompt).toContain(
      "Keep unrelated canon institutions and leadership intact unless the divergence explicitly changes them.",
    );
    expect(prompt).toContain("Describe the world AS IT EXISTS RIGHT NOW");
  });

  it("falls back to plain-text refined premise when a model returns prose instead of JSON", async () => {
    mockGenerateObject.mockRejectedValueOnce(
      new Error(
        "safeGenerateObject fallback: invalid JSON. Raw text: A custom protagonist of undefined species occupies Dr. Kel's position...",
      ),
    );
    mockGenerateText.mockResolvedValueOnce({
      text:
        "A custom protagonist occupies the Swiss mountain installation once associated with Dr. Kel's duties, operating the signal monitoring equipment and server arrays while heavy fog rolls through the surrounding forest. The ASO facility and its alien pressures remain intact, but the active operator is now the player's character rather than the canon protagonist.",
    });

    const refinedPremise = await generateRefinedPremiseStep(
      {
        ...fakeReq,
        premise: "Voices of the Void, but my custom operator replaced Dr. Kel at the base.",
      },
      {
        franchise: "Voices of the Void",
        keyFacts: [
          "Alpha Root Base is the main observatory facility.",
        ],
        tonalNotes: ["lonely sci-fi horror"],
        canonicalNames: {
          locations: ["Alpha Root Base"],
          factions: ["Alpen Signal Observatorium (ASO)"],
          characters: ["Dr. Kel"],
        },
        source: "mcp",
      },
    );

    expect(refinedPremise).toContain("custom protagonist");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("injects replacement-state divergence into known-IP location prompts", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Signal Base",
              purpose: "The station coordinating anomalous signal research.",
              isStarting: true,
            },
          ],
        },
      })
      // Per-entity detail call (1 location)
      .mockResolvedValueOnce({
        object: {
          description:
            "A wind-battered research compound full of listening towers and improvised labs. Scientists and support crews coordinate the region's signal sweeps from here.",
          tags: ["Cold", "Remote", "Technical"],
          connectedTo: [],
        },
      });

    await generateLocationsStep(
      {
        ...fakeReq,
        premise: "Voices of the Void, but my custom operator replaced Dr. Kel at the base.",
        premiseDivergence: {
          mode: "diverged",
          protagonistRole: {
            kind: "custom",
            interpretation: "replacement",
            canonicalCharacterName: "Dr. Kel",
            roleSummary: "The player's custom operator now fills Dr. Kel's former active role at Signal Base.",
          },
          preservedCanonFacts: ["Maxwell still handles supply runs for the base."],
          changedCanonFacts: ["Dr. Kel is no longer the active station operator."],
          currentStateDirectives: [
            "Describe Signal Base as staffed around the player's newly arrived operator, not Dr. Kel.",
          ],
          ambiguityNotes: [],
        },
      },
      "Voices of the Void, but my custom operator replaced Dr. Kel at the base.",
      {
        franchise: "Voices of the Void",
        keyFacts: [
          "Signal Base monitors anomalous transmissions in a remote valley.",
          "Maxwell still handles supply runs for the base.",
        ],
        tonalNotes: ["lonely sci-fi horror"],
        canonicalNames: {
          locations: ["Signal Base", "Transformer Yard"],
          factions: ["Research Staff"],
          characters: ["Dr. Kel", "Maxwell"],
        },
        source: "llm",
      },
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("CURRENT WORLD-STATE DIRECTIVES");
    expect(prompt).toContain(
      "Describe Signal Base as staffed around the player's newly arrived operator, not Dr. Kel.",
    );
    expect(prompt).toContain("Maxwell still handles supply runs for the base.");
  });

  it("injects targeted political divergence into known-IP faction prompts while preserving untouched canon", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Konohagakure",
              purpose: "The main governing shinobi village.",
            },
          ],
        },
      })
      // Per-entity detail call (1 faction)
      .mockResolvedValueOnce({
        object: {
          tags: ["Militaristic", "Disciplined"],
          goals: ["Contain the fallout from Sakura's altered alliances"],
          assets: ["ANBU", "Village administration"],
          territoryNames: ["Konohagakure"],
        },
      });

    await generateFactionsStep(
      {
        ...fakeReq,
        premise: "Naruto, but Sakura was trained by Orochimaru.",
        premiseDivergence: {
          mode: "diverged",
          protagonistRole: {
            kind: "canonical",
            interpretation: "unknown",
            canonicalCharacterName: null,
            roleSummary: "Canon protagonist roles remain intact.",
          },
          preservedCanonFacts: ["Naruto Uzumaki remains the Seventh Hokage."],
          changedCanonFacts: ["Sakura Haruno trained under Orochimaru instead of Tsunade."],
          currentStateDirectives: [
            "Change only the relationships, loyalties, and faction pressures that Sakura's altered training would affect.",
            "Keep unrelated Leaf institutions, leadership, and faction structures intact.",
          ],
          ambiguityNotes: [],
        },
      },
      "Konohagakure remains stable, but Sakura's altered loyalties create new faction tension.",
      ["Konohagakure"],
      {
        franchise: "Naruto",
        keyFacts: [
          "Konohagakure is one of the Five Great Shinobi Villages.",
          "Naruto Uzumaki remains the Seventh Hokage.",
        ],
        tonalNotes: ["Shonen action"],
        canonicalNames: {
          locations: ["Konohagakure"],
          factions: ["Konohagakure", "Otogakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno", "Orochimaru"],
        },
        source: "mcp",
      },
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("CHANGED CANON FACTS");
    expect(prompt).toContain("Sakura Haruno trained under Orochimaru instead of Tsunade.");
    expect(prompt).toContain("PRESERVED CANON FACTS");
    expect(prompt).toContain("Naruto Uzumaki remains the Seventh Hokage.");
    expect(prompt).toContain("Keep unrelated Leaf institutions, leadership, and faction structures intact.");
  });

  it("threads computed premiseDivergence through scaffold orchestration", async () => {
    const premiseDivergence = {
      mode: "diverged" as const,
      protagonistRole: {
        kind: "custom" as const,
        interpretation: "replacement" as const,
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player's custom operator replaces Dr. Kel at Signal Base.",
      },
      preservedCanonFacts: ["Maxwell still handles supply runs."],
      changedCanonFacts: ["Dr. Kel is no longer the active station operator."],
      currentStateDirectives: ["Build the present world around the new operator's arrival."],
      ambiguityNotes: [],
    };

    const mockInterpretPremiseDivergence = vi.fn().mockResolvedValue(premiseDivergence);
    const mockGenerateRefinedPremiseStep = vi
      .fn()
      .mockResolvedValue("Signal Base remains operational under new leadership.");
    const mockGenerateLocationsStep = vi.fn().mockResolvedValue([
      {
        name: "Signal Base",
        description: "A research station.",
        tags: ["Cold"],
        isStarting: true,
        connectedTo: [],
      },
    ]);
    const mockGenerateFactionsStep = vi.fn().mockResolvedValue([
      {
        name: "Research Staff",
        tags: ["Technical"],
        goals: ["Decode the anomaly"],
        assets: ["Signal arrays"],
        territoryNames: ["Signal Base"],
      },
    ]);
    const mockGenerateNpcsStep = vi.fn().mockResolvedValue([
      {
        name: "Maxwell",
        persona: "A loyal supply runner.",
        tags: ["Driver"],
        goals: { shortTerm: ["Deliver supplies"], longTerm: ["Keep the station alive"] },
        locationName: "Signal Base",
        factionName: "Research Staff",
        tier: "key" as const,
      },
    ]);
    const mockExtractLoreCards = vi.fn().mockResolvedValue([
      { term: "Signal Base", definition: "A remote station.", category: "location" as const },
    ]);
    const mockEvaluateResearchSufficiency = vi.fn(async (ctx: unknown) => ctx);

    vi.doMock("../premise-divergence.js", () => ({
      interpretPremiseDivergence: mockInterpretPremiseDivergence,
    }));
    vi.doMock("../scaffold-steps/premise-step.js", () => ({
      generateRefinedPremiseStep: mockGenerateRefinedPremiseStep,
    }));
    vi.doMock("../scaffold-steps/locations-step.js", () => ({
      generateLocationsStep: mockGenerateLocationsStep,
    }));
    vi.doMock("../scaffold-steps/factions-step.js", () => ({
      generateFactionsStep: mockGenerateFactionsStep,
    }));
    vi.doMock("../scaffold-steps/npcs-step.js", () => ({
      generateNpcsStep: mockGenerateNpcsStep,
    }));
    vi.doMock("../lore-extractor.js", () => ({
      extractLoreCards: mockExtractLoreCards,
    }));
    vi.doMock("../ip-researcher.js", () => ({
      evaluateResearchSufficiency: mockEvaluateResearchSufficiency,
    }));
    vi.doMock("../../lib/index.js", () => ({
      createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      })),
    }));

    const { generateWorldScaffold } = await import("../scaffold-generator.js");

    const ipContext = {
      franchise: "Voices of the Void",
      keyFacts: ["Signal Base monitors anomalous transmissions."],
      tonalNotes: ["lonely sci-fi horror"],
      canonicalNames: {
        locations: ["Signal Base"],
        factions: ["Research Staff"],
        characters: ["Dr. Kel", "Maxwell"],
      },
      source: "llm" as const,
    };

    await generateWorldScaffold({
      ...fakeReq,
      ipContext,
    });

    expect(mockInterpretPremiseDivergence).toHaveBeenCalledWith(
      ipContext,
      fakeReq.premise,
      fakeReq.role,
    );
    expect(mockGenerateRefinedPremiseStep).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence }),
      ipContext,
    );
    expect(mockGenerateLocationsStep).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence }),
      "Signal Base remains operational under new leadership.",
      ipContext,
    );
    expect(mockGenerateFactionsStep).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence }),
      "Signal Base remains operational under new leadership.",
      ["Signal Base"],
      ipContext,
    );
    expect(mockGenerateNpcsStep).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence }),
      "Signal Base remains operational under new leadership.",
      ["Signal Base"],
      ["Research Staff"],
      ipContext,
    );
    expect(mockExtractLoreCards).toHaveBeenCalledWith(
      expect.objectContaining({ refinedPremise: "Signal Base remains operational under new leadership." }),
      fakeReq.role,
      undefined,
      ipContext,
      premiseDivergence,
    );
  });
});
