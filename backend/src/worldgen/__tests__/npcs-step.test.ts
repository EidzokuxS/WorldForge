import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { generateNpcsStep } from "../scaffold-steps/npcs-step.js";

const fakeReq = {
  campaignId: "campaign-1",
  name: "Test World",
  premise: "A crumbling sci-fi facility haunted by impossible signals.",
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

describe("generateNpcsStep", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  it("keeps world generation alive when the planning calls return fewer NPCs than requested", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Dr. Kel",
              role: "Operates the station's signal array and monitors unusual readings.",
              locationName: "Observation Deck",
              factionName: "Station Authority",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Mara Voss",
              role: "Trades access codes and rumors to stranded visitors.",
              locationName: "Dock Bazaar",
              factionName: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Dr. Kel",
              persona: "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
              tags: ["Signal Analyst", "Paranoid", "Exhausted"],
              goals: {
                shortTerm: ["Prove the newest signal burst came from outside the station"],
                longTerm: ["Decode the source before Station Authority silences the evidence"],
              },
            },
            {
              name: "Mara Voss",
              persona: "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
              tags: ["Smuggler", "Connected", "Pragmatic"],
              goals: {
                shortTerm: ["Sell forged dock passes before the next lockdown"],
                longTerm: ["Secure enough leverage to escape the station alive"],
              },
            },
          ],
        },
      });

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck", "Dock Bazaar"],
      ["Station Authority"],
      null,
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      expect.objectContaining({
        name: "Dr. Kel",
        locationName: "Observation Deck",
        factionName: "Station Authority",
        tier: "key",
        draft: expect.objectContaining({
          identity: expect.objectContaining({
            role: "npc",
            displayName: "Dr. Kel",
          }),
          socialContext: expect.objectContaining({
            currentLocationName: "Observation Deck",
            factionName: "Station Authority",
          }),
        }),
      }),
      expect.objectContaining({
        name: "Mara Voss",
        locationName: "Dock Bazaar",
        factionName: null,
        tier: "supporting",
        draft: expect.objectContaining({
          identity: expect.objectContaining({
            role: "npc",
            displayName: "Mara Voss",
          }),
        }),
      }),
    ]);
  });

  it("grounds known-IP NPC prompts in replacement-state divergence without erasing unrelated canon", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Maxwell",
              role: "Keeps the station supplied and knows who can still be trusted.",
              locationName: "Signal Base",
              factionName: "Research Staff",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Lena Orlov",
              role: "Maintains the outer dishes and sells favors to desperate crew.",
              locationName: "Signal Base",
              factionName: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Maxwell",
              persona: "A careful supply runner who keeps the base alive through stubborn routine. He trusts the new operator more than the vanished command structure.",
              tags: ["Driver", "Reliable", "Observant"],
              goals: {
                shortTerm: ["Keep the next supply run on schedule"],
                longTerm: ["See the station survive the anomaly season"],
              },
            },
            {
              name: "Lena Orlov",
              persona: "A hard-edged technician who sells access to restricted maintenance routes. She wants the new operator to succeed because the old chain of command failed her.",
              tags: ["Technician", "Pragmatic", "Connected"],
              goals: {
                shortTerm: ["Trade safe routes for spare parts"],
                longTerm: ["Build enough leverage to leave the valley"],
              },
            },
          ],
        },
      });

    await generateNpcsStep(
      {
        ...fakeReq,
        premise: "Voices of the Void, but my custom operator replaced Dr. Kel at Signal Base.",
        premiseDivergence: {
          mode: "diverged",
          protagonistRole: {
            kind: "custom",
            interpretation: "replacement",
            canonicalCharacterName: "Dr. Kel",
            roleSummary: "The player's custom operator now occupies Dr. Kel's active role at Signal Base.",
          },
          preservedCanonFacts: ["Maxwell still handles supply runs for the base."],
          changedCanonFacts: ["Dr. Kel is no longer the active station operator."],
          currentStateDirectives: [
            "Do not place Dr. Kel in the present cast unless the divergence explicitly says he still coexists.",
            "Keep Maxwell and other unaffected canon support staff available if canon still supports them.",
          ],
          ambiguityNotes: [],
        },
      },
      "Signal Base remains active under a newly arrived custom operator.",
      ["Signal Base"],
      ["Research Staff"],
      {
        franchise: "Voices of the Void",
        keyFacts: [
          "Signal Base monitors anomalous transmissions in a remote valley.",
          "Maxwell still handles supply runs for the base.",
        ],
        tonalNotes: ["lonely sci-fi horror"],
        canonicalNames: {
          locations: ["Signal Base"],
          factions: ["Research Staff"],
          characters: ["Dr. Kel", "Maxwell"],
        },
        source: "llm",
      },
    );

    const keyPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(keyPlanPrompt).toContain("CURRENT WORLD-STATE DIRECTIVES");
    expect(keyPlanPrompt).toContain(
      "Do not place Dr. Kel in the present cast unless the divergence explicitly says he still coexists.",
    );
    expect(keyPlanPrompt).toContain("Maxwell still handles supply runs for the base.");
  });
});
