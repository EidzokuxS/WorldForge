import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerStats } from "@worldforge/shared";

const mockGenerateObject = vi.fn();
const mockEnrichKnownIpWorldgenNpcDraft = vi.fn();
const mockAssessOriginalCharacterPowerStats = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../character/known-ip-worldgen-research.js", () => ({
  enrichKnownIpWorldgenNpcDraft: vi.fn((...args: unknown[]) =>
    mockEnrichKnownIpWorldgenNpcDraft(...args)),
  loosePowerStatsSchema: {},
  normalizeLlmPowerStats: vi.fn(),
  repairPowerStats: vi.fn(),
  AP_DUR_TIER_LIST: "",
  SPEED_TIER_LIST: "",
  INTELLIGENCE_TIER_LIST: "",
  describeZodIssues: vi.fn(),
  recordFromUnknown: vi.fn(),
}));

vi.mock("../../character/ingestion/assess-original.js", () => ({
  assessOriginalCharacterPowerStats: vi.fn((...args: unknown[]) =>
    mockAssessOriginalCharacterPowerStats(...args)),
}));

vi.mock("../../character/ingestion/power-assessor.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../character/ingestion/power-assessor.js")>();
  return {
    ...actual,
    assessPowerStats: vi.fn(actual.assessPowerStats),
  };
});

vi.mock("../../character/enrich-npc-batch.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../character/enrich-npc-batch.js")>();
  return {
    ...actual,
    enrichNpcsBatch: vi.fn(actual.enrichNpcsBatch),
  };
});

import { assessOriginalCharacterPowerStats } from "../../character/ingestion/assess-original.js";
import { IngestionPipelineError } from "../../character/ingestion/errors.js";
import { enrichNpcsBatch } from "../../character/enrich-npc-batch.js";
import { enrichKnownIpWorldgenNpcDraft } from "../../character/known-ip-worldgen-research.js";
import { assessPowerStats } from "../../character/ingestion/power-assessor.js";
import { generateNpcsStep } from "../scaffold-steps/npcs-step.js";
import {
  gojoCanonicalNpcPlanFixture,
  jjkWithNarutoPowerSystemArtifact,
  makeArtifactWith,
  originalSupportingNpcPlanFixture,
} from "./fixtures/jjk-naruto-artifact.js";

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

const fakeReqWithResearch = {
  ...fakeReq,
  research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
} as const;

const pollutedMixedIpContext = {
  franchise: "Naruto and Jujutsu Kaisen",
  keyFacts: [
    "Tokyo Jujutsu High trains sorcerers in modern Japan.",
    "Naruto Uzumaki, Sasuke Uchiha, and Sakura Haruno shape shinobi politics.",
  ],
  tonalNotes: ["Urban occult action", "Shonen tactics"],
  canonicalNames: {
    locations: ["Tokyo Jujutsu High", "Hidden Leaf Village"],
    factions: ["Jujutsu Headquarters", "Akatsuki"],
    characters: [
      "Satoru Gojo",
      "Yuji Itadori",
      "Naruto Uzumaki",
      "Sasuke Uchiha",
      "Sakura Haruno",
    ],
  },
  source: "llm" as const,
};

function expectNpcArtifactRules(prompt: string): void {
  expect(prompt).toContain("RESEARCH CONTEXT FOR NPCS");
  expect(prompt).toContain(
    "Jujutsu Kaisen: role=world_basis; useFor=locations, factions, npcs, timeline; avoidFor=power_system",
  );
  expect(prompt).toContain(
    "Naruto: role=mechanics_overlay; useFor=power_system; avoidFor=locations, factions, npcs, timeline",
  );
  expect(prompt).toContain("Satoru Gojo");
  expect(prompt).toContain("Yuji Itadori");
  expect(prompt).toContain("Chakra-style energy control may be used as the imported power-system overlay.");
}

function expectNoLegacyNarutoCast(prompt: string): void {
  expect(prompt).not.toContain("CANONICAL CHARACTERS");
  expect(prompt).not.toContain("FRANCHISE REFERENCE");
  expect(prompt).not.toContain("Naruto Uzumaki");
  expect(prompt).not.toContain("Sasuke Uchiha");
  expect(prompt).not.toContain("Sakura Haruno");
  expect(prompt).not.toContain("Akatsuki");
  expect(prompt).not.toContain("List 6-10 CANONICAL characters from Naruto");
  expect(prompt).not.toContain("Build the canonical world");
}

function expectNpcScaffoldContract(prompt: string, anchor: string = "WORLD PREMISE:"): void {
  const marker = "STRUCTURED_OUTPUT_CONTRACT: scaffold-npc.v1";

  expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: scaffold-core.v1");
  expect(prompt).toContain(marker);
  expect(prompt.indexOf(marker)).toBeLessThan(prompt.indexOf(anchor));
  expect(prompt).toContain("Required fields");
  expect(prompt).toContain("Nested list/object shapes");
  expect(prompt).toContain("Caps");
  expect(prompt).toContain("Nullable/optional rules");
  expect(prompt).toContain("VALID MINIMAL");
  expect(prompt).toContain("VALID EXAMPLE");
  expect(prompt).toContain("INVALID");
  expect(prompt).toContain("Source authority");
  expect(prompt).toContain("backend must not invent source roles");
  expect(prompt).toContain("backend must not invent canonical truth");
  expect(prompt).toContain('"npcs": [{ "name"');
  expect(prompt).toContain('"factionName": null');
  expect(prompt).toContain('"sceneLocationName"');
  expect(prompt).toContain('"goals": { "shortTerm"');
  expect(prompt).toContain('"personalitySampleLines": ["..."]');
  expect(prompt).toContain("locationName remains broad macro/home");
  expect(prompt).toContain("sceneLocationName must exactly match a known location or sublocation");
  expect(prompt).toContain("Do not classify source roles, canon status, or franchise ownership from location/NPC names");
  expect(prompt).not.toMatch(/zod-to-contract|generic schema generator|ZodType/i);
}

interface PlannedNpcMock {
  name: string;
  role: string;
  locationName: string;
  sceneLocationName?: string | null;
  factionName: string | null;
}

interface NpcDetailMock {
  persona: string;
  selfImage: string;
  socialRoles: string[];
  tags: string[];
  goals: {
    shortTerm: string[];
    longTerm: string[];
  };
  personalitySummary: string;
  personalityVoice: string;
  personalityDecisionStyle: string;
  personalityWorldview: string;
  personalityContradictions: string[];
  personalityMythology: string;
  personalitySampleLines: string[];
}

function queueNpcPlans(
  keyNpcs: PlannedNpcMock[],
  supportingNpcs: PlannedNpcMock[] = [],
): void {
  mockGenerateObject
    .mockResolvedValueOnce({ object: { npcs: keyNpcs } })
    .mockResolvedValueOnce({ object: { npcs: supportingNpcs } });
}

function buildNpcDetail(overrides: Partial<NpcDetailMock> = {}): NpcDetailMock {
  return {
    persona:
      "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
    selfImage:
      "The only person listening closely enough to hear the station answer.",
    socialRoles: ["Signal Array Custodian"],
    tags: ["Signal Analyst", "Paranoid", "Exhausted"],
    goals: {
      shortTerm: ["Prove the newest signal burst came from outside the station"],
      longTerm: ["Decode the source before Station Authority silences the evidence"],
    },
    personalitySummary: "Cautious scholar who trusts data more than people",
    personalityVoice: "Clipped, precise, frequently referring to timestamps",
    personalityDecisionStyle: "Collects three independent readings before moving",
    personalityWorldview: "Patterns matter; people lie but data rarely does",
    personalityContradictions: [
      "Preaches objectivity but nurses a private grudge against the Authority",
    ],
    personalityMythology: "The last honest reader left on the deck",
    personalitySampleLines: [
      "I have that timestamped, if you would like to check.",
      "Patience. The static is teaching me something.",
    ],
    ...overrides,
  };
}

function buildPowerStatsStub(): PowerStats {
  return {
    attackPotency: { tier: "Human", rank: 5 },
    speed: { tier: "Human", rank: 5 },
    durability: { tier: "Human", rank: 5 },
    intelligence: { tier: "Average", rank: 5 },
    hax: [],
    vulnerabilities: [],
  };
}

function queueKnownIpTwoTierNpcPlanAndDetails(): void {
  queueNpcPlans(
    [
      {
        name: "Gojo Satoru",
        role: "Teaches at Tokyo Jujutsu High while investigating border anomalies.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Sorcerers",
      },
    ],
    [
      {
        name: "Shoko Ieiri",
        role: "Handles emergency treatment and knows which students are already in over their heads.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Sorcerers",
      },
    ],
  );

  mockGenerateObject
    .mockResolvedValueOnce({
      object: buildNpcDetail({
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
        personalitySummary:
          "Brilliant showman masking constant vigilance behind arrogance",
      }),
    })
    .mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "Shoko Ieiri keeps Tokyo Jujutsu High functional by patching up students and quietly documenting the cost of every mission.",
        selfImage:
          "The medic who stays calm because everyone else is already falling apart.",
        socialRoles: ["Doctor", "School Medic"],
        tags: ["[Reverse Cursed Technique]", "[Clinical]", "[Reliable]"],
        goals: {
          shortTerm: ["Keep the injured students stable after the border incident"],
          longTerm: ["Preserve enough of the next generation to outlast the elders"],
        },
        personalitySummary:
          "Blunt medic who hides fatigue behind steady competence",
      }),
    });
}

function queueOriginalTwoTierNpcPlanAndDetails(): void {
  queueNpcPlans(
    [
      {
        name: "Dr. Kel",
        role: "Operates the station's signal array and monitors unusual readings.",
        locationName: "Observation Deck",
        factionName: "Station Authority",
      },
    ],
    [
      {
        name: "Mara Voss",
        role: "Trades access codes and rumors to stranded visitors.",
        locationName: "Dock Bazaar",
        factionName: null,
      },
    ],
  );

  mockGenerateObject
    .mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
        selfImage:
          "The only person listening closely enough to hear the station answer.",
        socialRoles: ["Signal Array Custodian"],
        tags: ["Signal Analyst", "Paranoid", "Exhausted"],
        goals: {
          shortTerm: ["Prove the newest signal burst came from outside the station"],
          longTerm: ["Decode the source before Station Authority silences the evidence"],
        },
        personalitySummary:
          "Cautious scholar who trusts data more than people",
      }),
    })
    .mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
        selfImage: "The broker everyone needs and nobody fully trusts.",
        socialRoles: ["Dock Broker"],
        tags: ["Smuggler", "Connected", "Pragmatic"],
        goals: {
          shortTerm: ["Sell forged dock passes before the next lockdown"],
          longTerm: ["Secure enough leverage to escape the station alive"],
        },
        personalitySummary:
          "Broker who survives by turning secrets into leverage",
      }),
    });
}

function queueSupportingOnlyOriginalNpcPlanAndDetail(): void {
  queueNpcPlans([], [
    {
      name: "Mara Voss",
      role: "Trades access codes and rumors to stranded visitors.",
      locationName: "Dock Bazaar",
      factionName: null,
    },
  ]);

  mockGenerateObject.mockResolvedValueOnce({
    object: buildNpcDetail({
      persona:
        "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
      selfImage: "The broker everyone needs and nobody fully trusts.",
      socialRoles: ["Dock Broker"],
      tags: ["Smuggler", "Connected", "Pragmatic"],
      goals: {
        shortTerm: ["Sell forged dock passes before the next lockdown"],
        longTerm: ["Secure enough leverage to escape the station alive"],
      },
      personalitySummary:
        "Broker who survives by turning secrets into leverage",
    }),
  });
}

describe("generateNpcsStep", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockReset();
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => draft);
    vi.mocked(assessOriginalCharacterPowerStats).mockReset();
    vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => draft);
    vi.mocked(enrichNpcsBatch).mockClear();
    vi.mocked(assessPowerStats).mockClear();
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
        object: buildNpcDetail({
          persona: "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
          selfImage: "The only person listening closely enough to hear the station answer.",
          socialRoles: ["Signal Array Custodian"],
          tags: ["Signal Analyst", "Paranoid", "Exhausted"],
          goals: {
            shortTerm: ["Prove the newest signal burst came from outside the station"],
            longTerm: ["Decode the source before Station Authority silences the evidence"],
          },
          personalitySummary:
            "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
        }),
      })
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona: "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
          selfImage: "The broker everyone needs and nobody fully trusts.",
          socialRoles: ["Dock Broker"],
          tags: ["Smuggler", "Connected", "Pragmatic"],
          goals: {
            shortTerm: ["Sell forged dock passes before the next lockdown"],
            longTerm: ["Secure enough leverage to escape the station alive"],
          },
          personalitySummary:
            "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
        }),
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
            baseFacts: expect.objectContaining({
              socialRole: expect.arrayContaining(["Signal Array Custodian"]),
            }),
            personality: expect.objectContaining({
              summary: "A sleep-deprived systems scientist who trusts data more than people. He keeps hearing patterns in the static and fears the station is already speaking back.",
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
          identity: expect.objectContaining({
            role: "npc",
            displayName: "Mara Voss",
            baseFacts: expect.objectContaining({
              socialRole: expect.arrayContaining(["Dock Broker"]),
            }),
            personality: expect.objectContaining({
              summary: "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
            }),
          }),
        }),
      }),
    ]);
  });

  it("requests explicit NPC scene placement and preserves broad versus scoped location fields", async () => {
    queueNpcPlans([
      {
        name: "Megumi Fushiguro",
        role: "Searches transit platforms while tracking the incident perimeter.",
        locationName: "Shibuya",
        sceneLocationName: "Shibuya Station Platform",
        factionName: "Jujutsu Sorcerers",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "A disciplined sorcerer moving through rail platforms with controlled urgency. He keeps the larger district map in mind while searching the sealed station level.",
        selfImage: "The sorcerer responsible for keeping one more platform from collapsing.",
        socialRoles: ["Field Sorcerer"],
        tags: ["Sorcerer", "Tactical", "Guarded"],
        goals: {
          shortTerm: ["Sweep the lower platform for trapped civilians"],
          longTerm: ["Keep the incident from spilling beyond Shibuya"],
        },
        personalitySummary: "Controlled field sorcerer treating each platform as a tactical problem",
      }),
    });

    const result = await generateNpcsStep(
      fakeReq,
      "A dense occult incident spreads across Shibuya without putting every actor in one room.",
      ["Shibuya", "Shibuya Station Platform", "Dogenzaka Alley"],
      ["Jujutsu Sorcerers"],
      null,
    );

    const keyPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const supportingPlanPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;
    const detailPrompt = (mockGenerateObject.mock.calls[2]![0] as Record<string, unknown>)
      .prompt as string;

    for (const prompt of [keyPlanPrompt, supportingPlanPrompt, detailPrompt]) {
      expectNpcScaffoldContract(prompt);
      expect(prompt).toContain("KNOWN LOCATIONS: Shibuya, Shibuya Station Platform, Dogenzaka Alley");
      expect(prompt).toContain("sceneLocationName may be null/omitted when no scoped scene evidence exists");
    }
    expect(detailPrompt).toContain("Scene: Shibuya Station Platform");

    expect(result).toEqual([
      expect.objectContaining({
        name: "Megumi Fushiguro",
        locationName: "Shibuya",
        sceneLocationName: "Shibuya Station Platform",
        draft: expect.objectContaining({
          socialContext: expect.objectContaining({
            currentLocationName: "Shibuya",
          }),
        }),
      }),
    ]);
  });

  it("normalizes sublocation broad NPC placement to the parent macro and scoped scene", async () => {
    queueNpcPlans([
      {
        name: "Platform Medic",
        role: "Treats civilians on the lower station platform.",
        locationName: "Shibuya Station Platform",
        sceneLocationName: null,
        factionName: null,
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "A field medic triaging civilians beneath Shibuya station. She keeps her voice level while the platform ceiling groans overhead.",
        selfImage: "The last steady pair of hands on the platform.",
        socialRoles: ["Field Medic"],
        tags: ["Medic", "Calm", "Tactical"],
        goals: {
          shortTerm: ["Stabilize wounded civilians on the platform"],
          longTerm: ["Move survivors back to the district surface"],
        },
        personalitySummary: "Calm field medic anchored to the platform crisis",
      }),
    });

    const result = await generateNpcsStep(
      fakeReq,
      "A dense occult incident spreads across Shibuya.",
      [
        {
          name: "Shibuya",
          description: "A dense district.",
          tags: ["urban"],
          isStarting: true,
          connectedTo: [],
          kind: "macro",
          parentLocationName: null,
        },
        {
          name: "Shibuya Station Platform",
          description: "A lower platform under pressure.",
          tags: ["transit"],
          isStarting: false,
          connectedTo: ["Shibuya"],
          kind: "persistent_sublocation",
          parentLocationName: "Shibuya",
        },
      ],
      [],
      null,
    );

    expect(result[0]).toMatchObject({
      name: "Platform Medic",
      locationName: "Shibuya",
      sceneLocationName: "Shibuya Station Platform",
    });
  });

  it("rejects invalid explicit NPC scene placement instead of falling back to the first location", async () => {
    queueNpcPlans([
      {
        name: "Misplaced Scout",
        role: "Claims a scene that does not exist in the scaffold namespace.",
        locationName: "Shibuya",
        sceneLocationName: "Nonexistent Station Annex",
        factionName: null,
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "A scout whose assignment depends on a location outside the generated namespace.",
        selfImage: "The scout with a bad assignment packet.",
        socialRoles: ["Scout"],
        tags: ["Scout", "Confused", "Mobile"],
        goals: {
          shortTerm: ["Find the assigned annex"],
          longTerm: ["Report a valid route back to command"],
        },
        personalitySummary: "Scout carrying an invalid scene assignment",
      }),
    });

    await expect(
      generateNpcsStep(
        fakeReq,
        "A dense occult incident spreads across Shibuya.",
        ["Shibuya", "Shibuya Station Platform"],
        [],
        null,
      ),
    ).rejects.toThrow(/sceneLocationName/i);
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
        object: buildNpcDetail({
          persona: "A careful supply runner who keeps the base alive through stubborn routine. He trusts the new operator more than the vanished command structure.",
          selfImage: "The last dependable line keeping Signal Base supplied.",
          socialRoles: ["Supply Runner"],
          tags: ["Driver", "Reliable", "Observant"],
          goals: {
            shortTerm: ["Keep the next supply run on schedule"],
            longTerm: ["See the station survive the anomaly season"],
          },
          personalitySummary:
            "A careful supply runner who keeps the base alive through stubborn routine. He trusts the new operator more than the vanished command structure.",
        }),
      })
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona: "A hard-edged technician who sells access to restricted maintenance routes. She wants the new operator to succeed because the old chain of command failed her.",
          selfImage: "The mechanic who survives by staying useful and indispensable.",
          socialRoles: ["Maintenance Technician"],
          tags: ["Technician", "Pragmatic", "Connected"],
          goals: {
            shortTerm: ["Trade safe routes for spare parts"],
            longTerm: ["Build enough leverage to leave the valley"],
          },
          personalitySummary:
            "A hard-edged technician who sells access to restricted maintenance routes. She wants the new operator to succeed because the old chain of command failed her.",
        }),
      });

    await generateNpcsStep(
      {
        ...fakeReqWithResearch,
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

  it("uses artifact source rules for NPC planning and details instead of legacy Naruto cast", async () => {
    queueNpcPlans(
      [
        {
          name: "Satoru Gojo",
          role: "Protects students while investigating the chakra-overlay anomaly.",
          locationName: "Tokyo Jujutsu High",
          factionName: "Jujutsu Headquarters",
        },
      ],
      [
        {
          name: "Yuji Itadori",
          role: "Draws the player into student-level curse incidents.",
          locationName: "Tokyo Jujutsu High",
          factionName: "Jujutsu Headquarters",
        },
      ],
    );
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "Satoru Gojo teaches at Tokyo Jujutsu High while tracking how chakra control changes curse fights. He protects students from elders who want to weaponize the anomaly.",
          selfImage:
            "The strongest teacher standing between his students and institutional rot.",
          socialRoles: ["Teacher", "Special Grade Sorcerer"],
          tags: ["Limitless", "Teacher", "Protective"],
          goals: {
            shortTerm: ["Contain the chakra-overlay incident before headquarters buries evidence"],
            longTerm: ["Keep students alive long enough to change jujutsu society"],
          },
          personalitySummary:
            "Brilliant showman masking constant vigilance behind arrogance",
        }),
      })
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "Yuji Itadori runs into danger because he still believes saving people matters. Chakra mechanics complicate his close-quarters style without changing his place in jujutsu society.",
          selfImage: "The student who has to save one more person before counting the cost.",
          socialRoles: ["Student", "Vessel"],
          tags: ["Courageous", "Physical Fighter", "Empathetic"],
          goals: {
            shortTerm: ["Find classmates caught near the latest curse outbreak"],
            longTerm: ["Die surrounded by people who know he tried"],
          },
          personalitySummary:
            "Earnest fighter carrying fear behind stubborn compassion",
        }),
      });

    await generateNpcsStep(
      {
        ...fakeReqWithResearch,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High", "Shibuya"],
      ["Jujutsu Headquarters"],
      pollutedMixedIpContext,
    );

    const keyPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const supportingPlanPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;
    const detailPrompt = (mockGenerateObject.mock.calls[2]![0] as Record<string, unknown>)
      .prompt as string;

    expectNpcArtifactRules(keyPlanPrompt);
    expectNpcArtifactRules(supportingPlanPrompt);
    expectNpcArtifactRules(detailPrompt);
    expectNpcScaffoldContract(keyPlanPrompt);
    expectNpcScaffoldContract(supportingPlanPrompt);
    expectNpcScaffoldContract(detailPrompt);
    expectNoLegacyNarutoCast(keyPlanPrompt);
    expectNoLegacyNarutoCast(supportingPlanPrompt);
    expectNoLegacyNarutoCast(detailPrompt);
    expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(enrichKnownIpWorldgenNpcDraft).mock.calls) {
      expect(call[0]?.franchise).toBe("Jujutsu Kaisen");
    }
  });

  it("emits artifact source rules for NPCs when ipContext is null", async () => {
    queueNpcPlans([
      {
        name: "Satoru Gojo",
        role: "Protects students while investigating the chakra-overlay anomaly.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "Satoru Gojo teaches at Tokyo Jujutsu High while tracking how chakra control changes curse fights. He protects students from elders who want to weaponize the anomaly.",
        selfImage:
          "The strongest teacher standing between his students and institutional rot.",
        socialRoles: ["Teacher", "Special Grade Sorcerer"],
        tags: ["Limitless", "Teacher", "Protective"],
        goals: {
          shortTerm: ["Contain the chakra-overlay incident before headquarters buries evidence"],
          longTerm: ["Keep students alive long enough to change jujutsu society"],
        },
        personalitySummary:
          "Brilliant showman masking constant vigilance behind arrogance",
      }),
    });

    await generateNpcsStep(
      {
        ...fakeReqWithResearch,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High"],
      ["Jujutsu Headquarters"],
      null,
    );

    const keyPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectNpcArtifactRules(keyPlanPrompt);
  });

  it("Phase 73 keeps artifact-backed Satoru Gojo on known-IP power dispatch", async () => {
    queueNpcPlans(
      [
        {
          name: "Satoru Gojo",
          role: "Protects students while investigating the chakra-overlay anomaly.",
          locationName: "Tokyo Jujutsu High",
          factionName: "Jujutsu Headquarters",
        },
      ],
      [
        {
          name: "Campus Quartermaster",
          role: "Supplies students with field kits before curse incidents.",
          locationName: "Tokyo Jujutsu High",
          factionName: "Jujutsu Headquarters",
        },
      ],
    );
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "Satoru Gojo teaches at Tokyo Jujutsu High while tracking how chakra control changes curse fights. He protects students from elders who want to weaponize the anomaly.",
          selfImage:
            "The strongest teacher standing between his students and institutional rot.",
          socialRoles: ["Teacher", "Special Grade Sorcerer"],
          tags: ["Limitless", "Teacher", "Protective"],
          goals: {
            shortTerm: ["Contain the chakra-overlay incident before headquarters buries evidence"],
            longTerm: ["Keep students alive long enough to change jujutsu society"],
          },
          personalitySummary:
            "Brilliant showman masking constant vigilance behind arrogance",
        }),
      })
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "The campus quartermaster knows which students burn through supplies fastest and which missions are being hidden by headquarters.",
          selfImage: "The last quiet ledger between students and institutional negligence.",
          socialRoles: ["Quartermaster"],
          tags: ["Supplier", "Observant", "Cautious"],
          goals: {
            shortTerm: ["Restock field kits before the next curse incident"],
            longTerm: ["Keep students supplied despite headquarters pressure"],
          },
          personalitySummary: "Cautious supplier tracking institutional neglect through inventory",
        }),
      });

    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: {
        ...buildPowerStatsStub(),
        attackPotency: { tier: "City", rank: 8 },
        speed: { tier: "Massively Hypersonic", rank: 9 },
        durability: { tier: "City", rank: 10 },
        intelligence: { tier: "Genius", rank: 8 },
      },
    }));
    vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: buildPowerStatsStub(),
    }));

    const result = await generateNpcsStep(
      {
        ...fakeReqWithResearch,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High"],
      ["Jujutsu Headquarters"],
      null,
    );

    expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledTimes(1);
    expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        franchise: "Jujutsu Kaisen",
      }),
    );
    expect(assessOriginalCharacterPowerStats).toHaveBeenCalledTimes(1);
    expect(result[0]?.draft?.identity.canonicalStatus).toBe("known_ip_canonical");
    expect(result[0]?.draft?.powerStats?.attackPotency.tier).toBe("City");
    expect(result[1]?.draft?.identity.canonicalStatus).toBe("original");
    expect(result[1]?.draft?.powerStats?.attackPotency.tier).toBe("Human");
  });

  it("dispatches artifact Gojo as known-IP and Mika Tanaka as original without legacy context", async () => {
    queueNpcPlans(
      [
        {
          name: gojoCanonicalNpcPlanFixture.name,
          role: "Protects students while investigating the chakra-overlay anomaly.",
          locationName: "Tokyo Jujutsu High",
          factionName: "Jujutsu Headquarters",
        },
      ],
      [
        {
          name: originalSupportingNpcPlanFixture.name,
          role: "Maintains campus records and points newcomers toward safe errands.",
          locationName: "Tokyo Jujutsu High",
          factionName: "Jujutsu Headquarters",
        },
      ],
    );
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "Satoru Gojo teaches at Tokyo Jujutsu High while tracking how chakra control changes curse fights. He protects students from elders who want to weaponize the anomaly.",
          selfImage:
            "The strongest teacher standing between his students and institutional rot.",
          socialRoles: ["Teacher", "Special Grade Sorcerer"],
          tags: ["Limitless", "Teacher", "Protective"],
          goals: {
            shortTerm: ["Contain the chakra-overlay incident before headquarters buries evidence"],
            longTerm: ["Keep students alive long enough to change jujutsu society"],
          },
          personalitySummary:
            "Brilliant showman masking constant vigilance behind arrogance",
        }),
      })
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "Mika Tanaka keeps campus records, field schedules, and rumor trails organized while sorcerers rush toward danger.",
          selfImage: "The quiet clerk who notices which missions become funerals.",
          socialRoles: ["Campus Clerk"],
          tags: ["Organized", "Observant", "Cautious"],
          goals: {
            shortTerm: ["Get newcomers assigned to safe errands before curfew"],
            longTerm: ["Keep enough records to expose headquarters negligence"],
          },
          personalitySummary: "Cautious clerk tracking institutional harm through paperwork",
        }),
      });

    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: {
        ...buildPowerStatsStub(),
        attackPotency: { tier: "City", rank: 8 },
      },
    }));
    vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: buildPowerStatsStub(),
    }));

    const result = await generateNpcsStep(
      {
        ...fakeReqWithResearch,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High"],
      ["Jujutsu Headquarters"],
      null,
    );

    const assessorCalls = vi.mocked(assessPowerStats).mock.calls.map((call) => call[0]);
    const gojoCall = assessorCalls.find(
      (call) => call?.draft.identity.displayName === gojoCanonicalNpcPlanFixture.name,
    );
    const mikaCall = assessorCalls.find(
      (call) => call?.draft.identity.displayName === originalSupportingNpcPlanFixture.name,
    );

    expect(gojoCall?.classification).toMatchObject({
      canonicalStatus: gojoCanonicalNpcPlanFixture.expectedCanonicalStatus,
      franchise: gojoCanonicalNpcPlanFixture.expectedFranchise,
      ipContext: null,
    });
    expect(gojoCall?.ctx.campaign.ipContext).toBeNull();
    expect(mikaCall?.classification).toMatchObject({
      canonicalStatus: originalSupportingNpcPlanFixture.expectedCanonicalStatus,
      franchise: originalSupportingNpcPlanFixture.expectedFranchise,
      ipContext: null,
    });
    expect(mikaCall?.ctx.campaign.ipContext).toBeNull();
    expect(result[0]?.draft?.identity.canonicalStatus).toBe("known_ip_canonical");
    expect(result[1]?.draft?.identity.canonicalStatus).toBe("original");
  });

  it("does not pass stale legacy context into prompts or assessPowerStats when artifact owns NPC dispatch", async () => {
    const stalePremiseDivergence = {
      mode: "diverged" as const,
      protagonistRole: {
        kind: "canonical" as const,
        interpretation: "replacement" as const,
        canonicalCharacterName: "Satoru Gojo",
        roleSummary: "A stale legacy cache claims Gojo is absent from this world.",
      },
      preservedCanonFacts: [],
      changedCanonFacts: ["Satoru Gojo should be absent."],
      currentStateDirectives: [
        "CURRENT WORLD-STATE DIRECTIVES: Remove Gojo from the present cast.",
      ],
      ambiguityNotes: [],
    };
    queueNpcPlans([
      {
        name: gojoCanonicalNpcPlanFixture.name,
        role: "Protects students while investigating the chakra-overlay anomaly.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "Satoru Gojo teaches at Tokyo Jujutsu High while tracking how chakra control changes curse fights. He protects students from elders who want to weaponize the anomaly.",
        selfImage:
          "The strongest teacher standing between his students and institutional rot.",
        socialRoles: ["Teacher", "Special Grade Sorcerer"],
        tags: ["Limitless", "Teacher", "Protective"],
        goals: {
          shortTerm: ["Contain the chakra-overlay incident before headquarters buries evidence"],
          longTerm: ["Keep students alive long enough to change jujutsu society"],
        },
        personalitySummary:
          "Brilliant showman masking constant vigilance behind arrogance",
      }),
    });

    await generateNpcsStep(
      {
        ...fakeReqWithResearch,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
        premiseDivergence: stalePremiseDivergence,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High"],
      ["Jujutsu Headquarters"],
      pollutedMixedIpContext,
    );

    const gojoCall = vi.mocked(assessPowerStats).mock.calls
      .map((call) => call[0])
      .find((call) => call?.draft.identity.displayName === gojoCanonicalNpcPlanFixture.name);
    expect(gojoCall?.classification).toMatchObject({
      canonicalStatus: gojoCanonicalNpcPlanFixture.expectedCanonicalStatus,
      franchise: gojoCanonicalNpcPlanFixture.expectedFranchise,
      ipContext: null,
      premiseDivergence: null,
    });
    expect(gojoCall?.ctx.campaign.ipContext).toBeNull();
    expect(gojoCall?.ctx.campaign.premiseDivergence).toBeNull();

    const prompts = mockGenerateObject.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>).prompt as string,
    );
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt).not.toContain("CURRENT WORLD-STATE DIRECTIVES");
      expect(prompt).not.toContain("Remove Gojo from the present cast");
    }
  });

  it("uses the first eligible NPC source rule when multiple source rules could claim a canonical name", async () => {
    const collisionArtifact = makeArtifactWith((artifact) => {
      artifact.researchBrief.sourceUsageRules = [
        {
          sourceLabel: "Crossover Source A",
          role: "reference_only",
          useFor: ["characters", "npcs"],
          avoidFor: [],
          rationale: "First eligible source-rule order owns ambiguous aggregate character names.",
        },
        {
          sourceLabel: "Crossover Source B",
          role: "world_basis",
          useFor: ["locations", "factions", "npcs"],
          avoidFor: [],
          rationale: "Second eligible source must not override the first eligible source.",
        },
      ];
      artifact.generatedContext.canonicalNames ??= {
        locations: [],
        factions: [],
        characters: [],
      };
      artifact.generatedContext.canonicalNames.characters = ["Satoru Gojo"];
    });
    queueNpcPlans([
      {
        name: "Satoru Gojo",
        role: "Teaches at the crossover academy.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "Satoru Gojo teaches at the crossover academy while watching rival source authorities compete for the same name.",
        socialRoles: ["Teacher"],
        tags: ["Limitless", "Teacher"],
        personalitySummary: "Teacher caught between overlapping source rules",
      }),
    });

    await generateNpcsStep(
      {
        ...fakeReqWithResearch,
        premise: collisionArtifact.rawPremise,
        researchArtifact: collisionArtifact,
      },
      collisionArtifact.rawPremise,
      ["Tokyo Jujutsu High"],
      ["Jujutsu Headquarters"],
      null,
    );

    const gojoCall = vi.mocked(assessPowerStats).mock.calls
      .map((call) => call[0])
      .find((call) => call?.draft.identity.displayName === "Satoru Gojo");
    expect(gojoCall?.classification).toMatchObject({
      canonicalStatus: "known_ip_canonical",
      franchise: "Crossover Source A",
      ipContext: null,
    });
  });

  it("keeps legacy no-artifact NPC prompt authority wording stable", async () => {
    queueNpcPlans([
      {
        name: "Naruto Uzumaki",
        role: "Protects Konohagakure as its current Hokage.",
        locationName: "Konohagakure",
        factionName: "Konohagakure",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        persona:
          "Naruto Uzumaki leads Konohagakure with direct warmth and stubborn resolve. He protects the village while carrying the cost of every conflict that shaped him.",
        selfImage: "The Hokage who must make every sacrifice mean something.",
        socialRoles: ["Hokage", "Shinobi"],
        tags: ["Leader", "Jinchuriki", "Protective"],
        goals: {
          shortTerm: ["Contain the fallout from Sakura's altered training"],
          longTerm: ["Keep Konohagakure stable through the next crisis"],
        },
        personalitySummary:
          "Warm leader carrying responsibility behind relentless optimism",
      }),
    });

    await generateNpcsStep(
      { ...fakeReqWithResearch, researchArtifact: null },
      "Naruto, but Sakura was trained by Orochimaru.",
      ["Konohagakure"],
      ["Konohagakure"],
      {
        franchise: "Naruto",
        keyFacts: ["Naruto Uzumaki remains the Seventh Hokage."],
        tonalNotes: ["Shonen action"],
        canonicalNames: {
          locations: ["Konohagakure"],
          factions: ["Konohagakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno", "Orochimaru"],
        },
        source: "mcp",
      },
    );

    const keyPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const detailPrompt = (mockGenerateObject.mock.calls[2]![0] as Record<string, unknown>)
      .prompt as string;
    expect(keyPlanPrompt).toContain("List 6-10 CANONICAL characters from Naruto.");
    expect(keyPlanPrompt).toContain("CANONICAL CHARACTERS FROM NARUTO");
    expect(keyPlanPrompt).toContain("LEGACY IP REFERENCE (Naruto, verified via mcp)");
    expect(keyPlanPrompt).toContain("KNOWN-IP GENERATION CONTRACT FOR KEY NPCS");
    expect(detailPrompt).toContain("KNOWN-IP GENERATION CONTRACT FOR NPC DETAILS");
    expect(detailPrompt).toContain("For known-IP characters: describe their canonical personality and backstory");
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
        object: buildNpcDetail({
          persona: "A sleep-deprived systems scientist who trusts data more than people.",
          selfImage: "The analyst holding the station together by refusing to blink first.",
          socialRoles: ["Signal Analyst"],
          tags: ["Signal Analyst", "Paranoid", "Exhausted"],
          goals: {
            shortTerm: ["Prove the newest signal burst came from outside the station"],
            longTerm: ["Decode the source before Station Authority silences the evidence"],
          },
          personalitySummary:
            "A sleep-deprived systems scientist who trusts data more than people.",
        }),
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
        object: buildNpcDetail({
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
          personalitySummary:
            "Gojo Satoru teaches at Tokyo Jujutsu High while openly defying conservative elders and shielding his students from political fallout.",
        }),
      });
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: {
        attackPotency: { tier: "City", rank: 8 },
        speed: { tier: "Massively Hypersonic", rank: 9 },
        durability: { tier: "City", rank: 10 },
        intelligence: { tier: "Genius", rank: 7 },
        hax: [
          {
            name: "Infinity",
            type: "Spatial Manipulation",
            bypassTier: "City",
            limitations: ["Domain Expansion can bypass"],
          },
        ],
        vulnerabilities: [
          { description: "Sealed by Prison Realm", severity: "critical" as const },
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
        source: "mcp",
      },
    );

    expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        franchise: "Jujutsu Kaisen",
      }),
    );
    expect(result[0]?.draft?.powerStats?.attackPotency.tier).toBe("City");
  });

  it("emits a full identity.personality block for key and supporting NPCs", async () => {
    queueNpcPlans(
      [
        {
          name: "Dr. Kel",
          role: "Operates the signal array.",
          locationName: "Observation Deck",
          factionName: "Station Authority",
        },
      ],
      [
        {
          name: "Mara Voss",
          role: "Trades access codes and rumors.",
          locationName: "Dock Bazaar",
          factionName: null,
        },
      ],
    );
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail(),
      })
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          persona:
            "A smooth-talking broker who survives by knowing who is desperate and what they will trade. She plays all sides but quietly wants a path off the station before it collapses.",
          selfImage: "The broker everyone needs and nobody fully trusts.",
          socialRoles: ["Dock Broker"],
          tags: ["Smuggler", "Connected", "Pragmatic"],
          goals: {
            shortTerm: ["Sell forged dock passes before the next lockdown"],
            longTerm: ["Secure enough leverage to escape the station alive"],
          },
          personalitySummary: "Broker who survives by turning secrets into leverage",
          personalityVoice:
            "Low and transactional, masking urgency behind dry humor",
          personalityDecisionStyle:
            "Takes the deal with the fewest immediate liabilities",
          personalityWorldview:
            "Everyone has a price and the station punishes sincerity",
          personalityContradictions: [
            "Sells loyalty as a joke but secretly wants someone reliable",
          ],
          personalityMythology: "The broker who always knows the last safe door",
          personalitySampleLines: [
            "You want a pass, not a sermon, so let's keep this efficient.",
            "I can get you through the lockout, but the price doubles after curfew.",
          ],
        }),
      });

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck", "Dock Bazaar"],
      ["Station Authority"],
      null,
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.draft?.identity.personality).toEqual({
      summary: "Cautious scholar who trusts data more than people",
      voice: "Clipped, precise, frequently referring to timestamps",
      decisionStyle: "Collects three independent readings before moving",
      worldview: "Patterns matter; people lie but data rarely does",
      internalContradictions: [
        "Preaches objectivity but nurses a private grudge against the Authority",
      ],
      personalMythology: "The last honest reader left on the deck",
      sampleLines: [
        "I have that timestamped, if you would like to check.",
        "Patience. The static is teaching me something.",
      ],
    });
    expect(result[1]?.draft?.identity.personality).toEqual({
      summary: "Broker who survives by turning secrets into leverage",
      voice: "Low and transactional, masking urgency behind dry humor",
      decisionStyle: "Takes the deal with the fewest immediate liabilities",
      worldview: "Everyone has a price and the station punishes sincerity",
      internalContradictions: [
        "Sells loyalty as a joke but secretly wants someone reliable",
      ],
      personalMythology: "The broker who always knows the last safe door",
      sampleLines: [
        "You want a pass, not a sermon, so let's keep this efficient.",
        "I can get you through the lockout, but the price doubles after curfew.",
      ],
    });
  });

  it("retries once when sample lines are empty and keeps the repaired lines", async () => {
    queueNpcPlans([
      {
        name: "Dr. Kel",
        role: "Operates the signal array.",
        locationName: "Observation Deck",
        factionName: "Station Authority",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          personalitySampleLines: [],
        }),
      })
      .mockResolvedValueOnce({
        object: {
          personalityVoice: "Measured, clipped, and increasingly obsessive",
          personalitySampleLines: [
            "Listen again. The silence between the bursts is the real message.",
            "Station Authority can ignore me, but the numbers still accuse them.",
          ],
        },
      });

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck"],
      ["Station Authority"],
      null,
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
    const repairPrompt = (mockGenerateObject.mock.calls[3]![0] as Record<string, unknown>)
      .prompt as string;
    expectNpcScaffoldContract(repairPrompt, "NPC:");
    const personality = result[0]!.draft!.identity.personality!;
    expect(personality.voice).toBe(
      "Measured, clipped, and increasingly obsessive",
    );
    expect(personality.sampleLines).toEqual([
      "Listen again. The silence between the bursts is the real message.",
      "Station Authority can ignore me, but the numbers still accuse them.",
    ]);
  });

  it("retries once when sample lines are generic placeholders", async () => {
    queueNpcPlans([
      {
        name: "Dr. Kel",
        role: "Operates the signal array.",
        locationName: "Observation Deck",
        factionName: "Station Authority",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          personalitySampleLines: ["Hello there", "I am a character"],
        }),
      })
      .mockResolvedValueOnce({
        object: {
          personalityVoice:
            "Precise under stress, with irritation bleeding through the restraint",
          personalitySampleLines: [
            "You keep calling it noise because you are afraid of what it implies.",
            "I logged the anomaly three times before you even looked at the board.",
          ],
        },
      });

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck"],
      ["Station Authority"],
      null,
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
    const personality = result[0]!.draft!.identity.personality!;
    expect(personality.sampleLines).toEqual([
      "You keep calling it noise because you are afraid of what it implies.",
      "I logged the anomaly three times before you even looked at the board.",
    ]);
  });

  it("retries once when all sample lines are identical", async () => {
    queueNpcPlans([
      {
        name: "Dr. Kel",
        role: "Operates the signal array.",
        locationName: "Observation Deck",
        factionName: "Station Authority",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          personalitySampleLines: [
            "The pact is broken and we all know it.",
            "The pact is broken and we all know it.",
          ],
        }),
      })
      .mockResolvedValueOnce({
        object: {
          personalityVoice:
            "Formal until cornered, then suddenly sharp and accusatory",
          personalitySampleLines: [
            "You want the short version? The station lied first.",
            "Every broken protocol on this deck has someone's fingerprints on it.",
          ],
        },
      });

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck"],
      ["Station Authority"],
      null,
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
    const personality = result[0]!.draft!.identity.personality!;
    expect(personality.sampleLines).toEqual([
      "You want the short version? The station lied first.",
      "Every broken protocol on this deck has someone's fingerprints on it.",
    ]);
  });

  it("falls back to the primary detail if the retry call throws", async () => {
    queueNpcPlans([
      {
        name: "Dr. Kel",
        role: "Operates the signal array.",
        locationName: "Observation Deck",
        factionName: "Station Authority",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: buildNpcDetail({
          personalitySampleLines: [],
        }),
      })
      .mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck"],
      ["Station Authority"],
      null,
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
    const personality = result[0]!.draft!.identity.personality!;
    expect(personality.summary).toBe(
      "Cautious scholar who trusts data more than people",
    );
    expect(personality.sampleLines).toEqual([]);
  });

  it("preserves the full personality pack for key-tier known-IP NPCs", async () => {
    queueNpcPlans([
      {
        name: "Gojo Satoru",
        role: "Teaches at Tokyo Jujutsu High while investigating border anomalies.",
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Sorcerers",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
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
        personalitySummary:
          "Brilliant showman masking constant vigilance behind arrogance",
        personalityVoice:
          "Loose, teasing, and smug until danger sharpens him into precision",
        personalityDecisionStyle:
          "Provokes first, studies the response, then ends the problem decisively",
        personalityWorldview:
          "Power means responsibility to protect the next generation from rotten systems",
        personalityContradictions: [
          "Mocks the system openly while still carrying its burdens alone",
        ],
        personalityMythology:
          "The strongest who refuses to let strength become isolation",
        personalitySampleLines: [
          "Relax. If it gets ugly, I'll be the one standing when it ends.",
          "The elders call it recklessness because they hate being reminded they're obsolete.",
        ],
      }),
    });

    const result = await generateNpcsStep(
      fakeReqWithResearch,
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
        source: "mcp",
      },
    );

    expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledTimes(1);
    expect(result[0]?.draft?.identity.personality).toEqual({
      summary: "Brilliant showman masking constant vigilance behind arrogance",
      voice: "Loose, teasing, and smug until danger sharpens him into precision",
      decisionStyle:
        "Provokes first, studies the response, then ends the problem decisively",
      worldview:
        "Power means responsibility to protect the next generation from rotten systems",
      internalContradictions: [
        "Mocks the system openly while still carrying its burdens alone",
      ],
      personalMythology:
        "The strongest who refuses to let strength become isolation",
      sampleLines: [
        "Relax. If it gets ugly, I'll be the one standing when it ends.",
        "The elders call it recklessness because they hate being reminded they're obsolete.",
      ],
    });
  });

  it("does not retry when sample lines are already substantive", async () => {
    queueNpcPlans([
      {
        name: "Dr. Kel",
        role: "Operates the signal array.",
        locationName: "Observation Deck",
        factionName: "Station Authority",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: buildNpcDetail({
        personalitySampleLines: [
          "The winter council decided and I will not revisit it for your comfort.",
          "Bring me a more honest argument or leave the deck to someone serious.",
        ],
      }),
    });

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck"],
      ["Station Authority"],
      null,
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
    const personality = result[0]!.draft!.identity.personality!;
    expect(personality.voice).toBe(
      "Clipped, precise, frequently referring to timestamps",
    );
    expect(personality.sampleLines).toEqual([
      "The winter council decided and I will not revisit it for your comfort.",
      "Bring me a more honest argument or leave the deck to someone serious.",
    ]);
  });
});

describe("generateNpcsStep — Phase 65 PowerStats enrichment across all quadrants", () => {
  beforeEach(() => {
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockReset();
    vi.mocked(enrichKnownIpWorldgenNpcDraft).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: buildPowerStatsStub(),
    }));
    vi.mocked(assessOriginalCharacterPowerStats).mockReset();
    vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => draft);
    vi.mocked(enrichNpcsBatch).mockClear();
  });

  it("enriches PowerStats on BOTH tiers in a known-IP world", async () => {
    queueKnownIpTwoTierNpcPlanAndDetails();

    const result = await generateNpcsStep(
      fakeReqWithResearch,
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
          characters: ["Gojo Satoru", "Shoko Ieiri"],
        },
        source: "mcp",
      },
    );

    expect(result).toHaveLength(2);
    for (const npc of result) {
      expect(npc.draft?.powerStats).toBeDefined();
    }
    expect(enrichKnownIpWorldgenNpcDraft).toHaveBeenCalledTimes(2);
    expect(assessOriginalCharacterPowerStats).not.toHaveBeenCalled();
  });

  it("enriches PowerStats on BOTH tiers in an original world and runs enrichment exactly once per step", async () => {
    queueOriginalTwoTierNpcPlanAndDetails();
    vi.mocked(assessOriginalCharacterPowerStats).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: buildPowerStatsStub(),
    }));

    const result = await generateNpcsStep(
      fakeReq,
      fakeReq.premise,
      ["Observation Deck", "Dock Bazaar"],
      ["Station Authority"],
      null,
    );

    expect(result).toHaveLength(2);
    for (const npc of result) {
      expect(npc.draft?.powerStats).toBeDefined();
    }
    expect(assessOriginalCharacterPowerStats).toHaveBeenCalledTimes(2);
    expect(enrichKnownIpWorldgenNpcDraft).not.toHaveBeenCalled();
    expect(enrichNpcsBatch).toHaveBeenCalledTimes(1);
  });

  it("throws when PowerStats enrichment fails for a supporting-tier original-world NPC", async () => {
    queueSupportingOnlyOriginalNpcPlanAndDetail();
    vi.mocked(assessOriginalCharacterPowerStats).mockRejectedValue(
      new IngestionPipelineError({
        stage: "power_assess",
        attempts: 3,
        cause: new Error("assessment failed"),
        message: "assessment failed",
      }),
    );

    await expect(
      generateNpcsStep(
        fakeReq,
        fakeReq.premise,
        ["Dock Bazaar"],
        [],
        null,
      ),
    ).rejects.toMatchObject({
      name: "IngestionPipelineError",
      stage: "power_assess",
      attempts: 3,
    });
  });
});
