import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GenerateScaffoldRequest,
  ScaffoldFaction,
  ScaffoldLocation,
  ScaffoldNpc,
} from "../types.js";

const mockGenerateObject = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

import { expandNpcPlacementScenes } from "../scaffold-steps/placement-expansion-step.js";

const fakeReq = {
  campaignId: "campaign-1",
  name: "JJK/Naruto Test",
  premise: "JJK world with Naruto power system.",
  role: {
    provider: {
      id: "provider-1",
      name: "Test Provider",
      baseUrl: "http://localhost:1234",
      apiKey: "",
      model: "test-model",
    },
    temperature: 0.8,
    maxTokens: 4096,
  },
} as GenerateScaffoldRequest;

function makeNpc(name: string, sceneLocationName: string | null = null): ScaffoldNpc {
  return {
    name,
    persona: `${name} has a distinct role in the Shibuya situation.`,
    tags: [],
    goals: {
      shortTerm: [`Advance ${name}'s immediate agenda.`],
      longTerm: [`Keep ${name}'s long-term plot pressure alive.`],
    },
    locationName: "Shibuya",
    sceneLocationName,
    factionName: null,
    tier: "key",
    draft: {
      identity: {
        role: "npc",
        tier: "key",
        displayName: name,
        canonicalStatus: "known_ip_canonical",
        baseFacts: { biography: "", socialRole: [], hardConstraints: [] },
        behavioralCore: {
          motives: [],
          pressureResponses: [],
          taboos: [],
          attachments: [],
          selfImage: "",
        },
        liveDynamics: {
          attachments: [],
          activeGoals: [],
          beliefDrift: [],
          currentStrains: [],
          earnedChanges: [],
        },
        personality: {
          summary: "",
          voice: "",
          decisionStyle: "",
          worldview: "",
          internalContradictions: [],
          personalMythology: "",
          sampleLines: [],
        },
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Shibuya",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
      capabilities: {
        traits: [],
        skills: [],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      state: { hp: 5, conditions: [], statusFlags: [], activityState: "active" },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {},
      provenance: {
        sourceKind: "worldgen",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: `${name} needs a specific Shibuya scene.`,
        legacyTags: [],
      },
    },
  };
}

const locations: ScaffoldLocation[] = [
  {
    name: "Tokyo",
    description: "Greater Tokyo as the broad region.",
    tags: ["urban"],
    isStarting: false,
    connectedTo: ["Shibuya"],
    kind: "macro",
    parentLocationName: null,
  },
  {
    name: "Shibuya",
    description: "A huge urban ward with many streets, shops, platforms, and hidden fronts.",
    tags: ["urban", "crowded"],
    isStarting: false,
    connectedTo: ["Tokyo", "Shibuya Station Platform"],
    kind: "macro",
    parentLocationName: null,
  },
  {
    name: "Shibuya Station Platform",
    description: "A crowded platform beneath Shibuya Station.",
    tags: ["transit"],
    isStarting: true,
    connectedTo: ["Shibuya"],
    kind: "persistent_sublocation",
    parentLocationName: "Shibuya",
  },
];

const factions: ScaffoldFaction[] = [
  {
    name: "Jujutsu High",
    tags: ["sorcerers"],
    goals: ["Protect civilians"],
    assets: ["Students"],
    territoryNames: ["Shibuya"],
  },
];

describe("expandNpcPlacementScenes", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  it("expands crowded broad macro placement into cast-driven concrete scenes", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          scenes: [],
          placements: [
            { npcName: "Satoru Gojo", locationName: "Shibuya", sceneLocationName: "Shibuya", reason: "Still too broad." },
            { npcName: "Suguru Geto", locationName: "Shibuya", sceneLocationName: "Shibuya", reason: "Still too broad." },
            { npcName: "Mahito", locationName: "Shibuya", sceneLocationName: "Shibuya", reason: "Still too broad." },
            { npcName: "Yuji Itadori", locationName: "Shibuya", sceneLocationName: "Shibuya", reason: "Still too broad." },
            { npcName: "Megumi Fushiguro", locationName: "Shibuya", sceneLocationName: "Shibuya", reason: "Still too broad." },
            { npcName: "Nobara Kugisaki", locationName: "Shibuya", sceneLocationName: "Shibuya", reason: "Still too broad." },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          scenes: [
            {
              name: "Shibuya Station Concourse",
              parentLocationName: "Shibuya",
              description: "An underground crossing of gates, shops, and packed commuter lanes.",
              tags: ["transit", "crowded"],
              connectedTo: ["Shibuya", "Shibuya Station Platform"],
            },
            {
              name: "Dogenzaka Dessert Arcade",
              parentLocationName: "Shibuya",
              description: "A side arcade of dessert shops and narrow service corridors.",
              tags: ["shopping", "food"],
              connectedTo: ["Shibuya"],
            },
            {
              name: "Rooftop Service Corridor",
              parentLocationName: "Shibuya",
              description: "A maintenance route above the district's commercial blocks.",
              tags: ["rooftop", "restricted"],
              connectedTo: ["Shibuya"],
            },
          ],
          placements: [
            { npcName: "Satoru Gojo", locationName: "Shibuya", sceneLocationName: "Shibuya Station Concourse", reason: "He controls the main transit flow." },
            { npcName: "Suguru Geto", locationName: "Shibuya", sceneLocationName: "Rooftop Service Corridor", reason: "He watches from a hidden route." },
            { npcName: "Mahito", locationName: "Shibuya", sceneLocationName: "Dogenzaka Dessert Arcade", reason: "He stalks civilians in side streets." },
            { npcName: "Yuji Itadori", locationName: "Shibuya", sceneLocationName: "Shibuya Station Platform", reason: "He is in the active patrol path." },
            { npcName: "Megumi Fushiguro", locationName: "Shibuya", sceneLocationName: "Rooftop Service Corridor", reason: "He scouts from above." },
            { npcName: "Nobara Kugisaki", locationName: "Shibuya", sceneLocationName: "Dogenzaka Dessert Arcade", reason: "She follows the shopping side route." },
          ],
        },
      });

    const result = await expandNpcPlacementScenes(
      fakeReq,
      "JJK Shibuya before the incident, with Naruto-style chakra mechanics.",
      locations,
      factions,
      [
        makeNpc("Satoru Gojo"),
        makeNpc("Suguru Geto"),
        makeNpc("Mahito"),
        makeNpc("Yuji Itadori"),
        makeNpc("Megumi Fushiguro"),
        makeNpc("Nobara Kugisaki"),
      ],
      null,
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    const firstPrompt = mockGenerateObject.mock.calls[0]?.[0]?.prompt as string;
    const repairPrompt = mockGenerateObject.mock.calls[1]?.[0]?.prompt as string;
    expect(firstPrompt).toContain("STRUCTURED_OUTPUT_CONTRACT: npc-placement-expansion.v1");
    expect(firstPrompt).toContain("Do not merely create one token child scene per macro");
    expect(repairPrompt).toContain("NPC PLACEMENT REPAIR REQUIRED");

    expect(result.locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Shibuya Station Concourse",
          kind: "persistent_sublocation",
          parentLocationName: "Shibuya",
        }),
        expect.objectContaining({
          name: "Dogenzaka Dessert Arcade",
          kind: "persistent_sublocation",
          parentLocationName: "Shibuya",
        }),
        expect.objectContaining({
          name: "Rooftop Service Corridor",
          kind: "persistent_sublocation",
          parentLocationName: "Shibuya",
        }),
      ]),
    );

    const sceneCounts = new Map<string, number>();
    for (const npc of result.npcs) {
      expect(npc.locationName).toBe("Shibuya");
      expect(npc.sceneLocationName).toBeTruthy();
      expect(npc.sceneLocationName).not.toBe("Shibuya");
      sceneCounts.set(npc.sceneLocationName!, (sceneCounts.get(npc.sceneLocationName!) ?? 0) + 1);
    }
    expect([...sceneCounts.values()].every((count) => count <= 3)).toBe(true);
  });

  it("does not call the model when current placements are already scoped", async () => {
    const result = await expandNpcPlacementScenes(
      fakeReq,
      "A city with already scoped NPC placement.",
      locations,
      factions,
      [
        makeNpc("Yuji Itadori", "Shibuya Station Platform"),
        makeNpc("Satoru Gojo", "Shibuya Station Platform"),
      ],
      null,
    );

    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(result.locations).toEqual(locations);
    expect(result.npcs.map((npc) => npc.sceneLocationName)).toEqual([
      "Shibuya Station Platform",
      "Shibuya Station Platform",
    ]);
  });
});
