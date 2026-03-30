import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
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
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Observation Deck",
              description: "A cold ring of windows and consoles aimed at the dark beyond. Operators parse weak signals here while the station listens for impossible transmissions.",
              tags: ["Cold", "Technical", "Exposed"],
              connectedTo: ["Maintenance Tunnels"],
            },
            {
              name: "Maintenance Tunnels",
              description: "Narrow service corridors run behind the walls and beneath the deck plating. Engineers and smugglers both use them when they need to move unseen.",
              tags: ["Claustrophobic", "Industrial", "Hidden"],
              connectedTo: ["Observation Deck"],
            },
          ],
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
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Station Authority",
              tags: ["Bureaucratic", "Security-minded"],
              goals: ["Contain knowledge of the anomalous transmissions"],
              assets: ["Security teams", "Communications blackout protocols"],
              territoryNames: ["Observation Deck"],
            },
          ],
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
});
