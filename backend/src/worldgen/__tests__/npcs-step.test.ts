import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateObject = vi.fn();
const mockEnrichKnownIpWorldgenNpcDraft = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../character/known-ip-worldgen-research.js", () => ({
  enrichKnownIpWorldgenNpcDraft: (...args: unknown[]) =>
    mockEnrichKnownIpWorldgenNpcDraft(...args),
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
    mockEnrichKnownIpWorldgenNpcDraft.mockReset();
    mockEnrichKnownIpWorldgenNpcDraft.mockImplementation(async ({ draft }) => draft);
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
          persona: "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
          selfImage: "The only person listening closely enough to hear the station answer.",
          socialRoles: ["Signal Array Custodian"],
          tags: ["Signal Analyst", "Paranoid", "Exhausted"],
          goals: {
            shortTerm: ["Prove the newest signal burst came from outside the station"],
            longTerm: ["Decode the source before Station Authority silences the evidence"],
          },
        },
      })
      .mockResolvedValueOnce({
        object: {
          persona: "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
          selfImage: "The broker everyone needs and nobody fully trusts.",
          socialRoles: ["Dock Broker"],
          tags: ["Smuggler", "Connected", "Pragmatic"],
          goals: {
            shortTerm: ["Sell forged dock passes before the next lockdown"],
            longTerm: ["Secure enough leverage to escape the station alive"],
          },
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
          grounding: undefined,
          identity: expect.objectContaining({
            role: "npc",
            displayName: "Dr. Kel",
            baseFacts: expect.objectContaining({
              socialRole: expect.arrayContaining(["Signal Array Custodian"]),
            }),
            behavioralCore: expect.objectContaining({
              selfImage: "The only person listening closely enough to hear the station answer.",
            }),
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
          grounding: undefined,
          identity: expect.objectContaining({
            role: "npc",
            displayName: "Mara Voss",
            baseFacts: expect.objectContaining({
              socialRole: expect.arrayContaining(["Dock Broker"]),
            }),
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
          persona: "A careful supply runner who keeps the base alive through stubborn routine. He trusts the new operator more than the vanished command structure.",
          selfImage: "The last dependable line keeping Signal Base supplied.",
          socialRoles: ["Supply Runner"],
          tags: ["Driver", "Reliable", "Observant"],
          goals: {
            shortTerm: ["Keep the next supply run on schedule"],
            longTerm: ["See the station survive the anomaly season"],
          },
        },
      })
      .mockResolvedValueOnce({
        object: {
          persona: "A hard-edged technician who sells access to restricted maintenance routes. She wants the new operator to succeed because the old chain of command failed her.",
          selfImage: "The mechanic who survives by staying useful and indispensable.",
          socialRoles: ["Maintenance Technician"],
          tags: ["Technician", "Pragmatic", "Connected"],
          goals: {
            shortTerm: ["Trade safe routes for spare parts"],
            longTerm: ["Build enough leverage to leave the valley"],
          },
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

  it("teaches canonical character facets in the NPC detail prompt instead of a legacy npc-card worldview", async () => {
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
          npcs: [],
        },
      })
      .mockResolvedValueOnce({
        object: {
          persona: "A sleep-deprived systems scientist who trusts data more than people.",
          selfImage: "The analyst holding the station together by refusing to blink first.",
          socialRoles: ["Signal Analyst"],
          tags: ["Signal Analyst", "Paranoid", "Exhausted"],
          goals: {
            shortTerm: ["Prove the newest signal burst came from outside the station"],
            longTerm: ["Decode the source before Station Authority silences the evidence"],
          },
        },
      });

    await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck"],
      ["Station Authority"],
      null,
    );

    const detailPrompt = (mockGenerateObject.mock.calls[2]![0] as Record<string, unknown>)
      .prompt as string;
    expect(detailPrompt).toContain("shared draft pipeline");
    expect(detailPrompt).toContain("profile");
    expect(detailPrompt).toContain("socialContext");
    expect(detailPrompt).toContain("motivations");
    expect(detailPrompt).toContain("selfImage");
    expect(detailPrompt).toContain("socialRoles");
    expect(detailPrompt).not.toContain("You are writing NPC reference cards for a text RPG engine.");
  });

  it("runs per-character research grounding for known-IP key NPCs when research is enabled", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Gojo Satoru",
              role: "Teaches at Tokyo Jujutsu High while investigating border anomalies.",
              locationName: "Tokyo Jujutsu High",
              factionName: "Jujutsu Sorcerers",
            },
          ],
        },
      })
      .mockResolvedValueOnce({ object: { npcs: [] } })
      .mockResolvedValueOnce({
        object: {
          persona:
            "Gojo Satoru teaches at Tokyo Jujutsu High while openly defying conservative elders and shielding his students from political fallout.",
          selfImage:
            "The strongest wall standing between his students and a rotten jujutsu establishment.",
          socialRoles: ["Teacher", "Special Grade Sorcerer"],
          tags: ["[Six Eyes User]", "[Limitless Technique]", "[Protective Mentor]"],
          goals: {
            shortTerm: ["Contain the latest border incident before it reaches Tokyo"],
            longTerm: ["Break the conservative elders' grip on jujutsu society"],
          },
        },
      });
    mockEnrichKnownIpWorldgenNpcDraft.mockImplementation(async ({ draft }) => ({
      ...draft,
      grounding: {
        summary: "Canon-grounded Gojo profile",
        facts: ["Special Grade jujutsu sorcerer"],
        abilities: ["Six Eyes", "Limitless"],
        constraints: [],
        signatureMoves: ["Hollow Purple"],
        strongPoints: ["Extreme combat superiority"],
        vulnerabilities: [],
        uncertaintyNotes: ["Bounded to retrieved canon summary."],
        powerProfile: {
          attack: "Overwhelming cursed technique output.",
          speed: "High-speed combatant.",
          durability: "Protected by Infinity.",
          range: "Wide-area cursed technique reach.",
          strengths: ["Extreme combat superiority"],
          constraints: [],
          vulnerabilities: [],
          uncertaintyNotes: ["Bounded to retrieved canon summary."],
        },
        sources: [
          {
            kind: "canon",
            label: "Jujutsu Kaisen wiki",
            excerpt: "Gojo Satoru is a Special Grade jujutsu sorcerer...",
          },
        ],
      },
    }));

    const result = await generateNpcsStep(
      {
        ...fakeReq,
        research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
      },
      "Modern Japan houses Tokyo Jujutsu High and a hybrid curse-chakra conflict.",
      ["Tokyo Jujutsu High"],
      ["Jujutsu Sorcerers"],
      {
        franchise: "Jujutsu Kaisen",
        keyFacts: ["Tokyo Jujutsu High trains jujutsu sorcerers."],
        tonalNotes: ["urban supernatural action"],
        canonicalNames: {
          locations: ["Tokyo Jujutsu High"],
          factions: ["Jujutsu Sorcerers"],
          characters: ["Gojo Satoru"],
        },
        source: "search",
      },
    );

    expect(mockEnrichKnownIpWorldgenNpcDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        franchise: "Jujutsu Kaisen",
      }),
    );
    expect(result[0]?.draft?.grounding?.summary).toBe("Canon-grounded Gojo profile");
  });
});
