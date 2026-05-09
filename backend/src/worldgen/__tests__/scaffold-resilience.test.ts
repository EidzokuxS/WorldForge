import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  isSafeGenerateObjectError: (error: unknown) =>
    error instanceof Error &&
    (
      error.message.startsWith("safeGenerateObject:")
      || error.message.includes("safeGenerateObject fallback: invalid JSON")
      || error.message.includes("safeGenerateObject fallback: Zod validation failed")
    ),
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
import { regenerateLocationEntity } from "../scaffold-steps/regen-helpers.js";
import { buildScaffoldCorePromptContract } from "../scaffold-steps/prompt-utils.js";
import {
  cloneJjkNarutoArtifact,
  jjkWithNarutoPowerSystemArtifact,
  makeArtifactWith,
} from "./fixtures/jjk-naruto-artifact.js";

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

const pollutedMixedIpContext = {
  franchise: "Naruto and Jujutsu Kaisen",
  keyFacts: [
    "Tokyo Jujutsu High trains sorcerers in modern Japan.",
    "Hidden Villages organize shinobi power across the Five Great Nations.",
  ],
  tonalNotes: ["Urban occult action", "Shonen tactics"],
  canonicalNames: {
    locations: [
      "Tokyo Jujutsu High",
      "Shibuya",
      "Hidden Leaf Village",
      "Five Great Nations",
    ],
    factions: [
      "Jujutsu Headquarters",
      "Hidden Mist Village",
      "Akatsuki",
      "Five Great Nations",
    ],
    characters: ["Satoru Gojo", "Yuji Itadori", "Naruto Uzumaki"],
  },
  source: "llm" as const,
};

function expectArtifactRulesForTarget(prompt: string, target: string): void {
  expect(prompt).toContain(`RESEARCH CONTEXT FOR ${target.toUpperCase()}`);
  expect(prompt).toContain(
    "Jujutsu Kaisen: role=world_basis; useFor=locations, factions, npcs, timeline; avoidFor=power_system",
  );
  expect(prompt).toContain(
    "Naruto: role=mechanics_overlay; useFor=power_system; avoidFor=locations, factions, npcs, timeline",
  );
  expect(prompt).toContain("Tokyo Jujutsu High");
  expect(prompt).toContain("Cursed energy, curses, sorcerer grades");
  expect(prompt).toContain("Chakra-style energy control may be used as the imported power-system overlay.");
}

function expectNoNarutoWorldStructure(prompt: string): void {
  expect(prompt).not.toContain("Hidden Leaf Village");
  expect(prompt).not.toContain("Hidden Mist Village");
  expect(prompt).not.toContain("Five Great Nations");
  expect(prompt).not.toContain("Mizukage");
  expect(prompt).not.toContain("Raikage");
  expect(prompt).not.toContain("Akatsuki");
  expect(prompt).not.toContain("FRANCHISE REFERENCE");
  expect(prompt).not.toContain("CANONICAL LOCATIONS");
  expect(prompt).not.toContain("CANONICAL FACTIONS");
  expect(prompt).not.toContain("Build the canonical world");
  expect(prompt).not.toContain("This source IS the world");
}

function expectScaffoldContractBeforeWorldPremise(
  prompt: string,
  marker: string,
  snippets: string[],
): void {
  expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: scaffold-core.v1");
  expect(prompt).toContain(marker);
  expect(prompt.indexOf(marker)).toBeLessThan(prompt.indexOf("WORLD PREMISE:"));
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
  expect(prompt).not.toMatch(/zod-to-contract|generic schema generator|ZodType/i);

  for (const snippet of snippets) {
    expect(prompt).toContain(snippet);
  }
}

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

  it("builds a scaffold-core contract with semantic shape guidance", () => {
    const contract = buildScaffoldCorePromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: scaffold-core.v1");
    expect(contract).toContain("Required fields");
    expect(contract).toContain("Nested list/object shapes");
    expect(contract).toContain("Caps");
    expect(contract).toContain("Nullable/optional rules");
    expect(contract).toContain("VALID MINIMAL");
    expect(contract).toContain("VALID EXAMPLE");
    expect(contract).toContain("INVALID");
    expect(contract).toContain("Source authority");
    expect(contract).toContain("backend must not invent source roles");
    expect(contract).toContain("backend must not invent canonical truth");
    expect(contract).not.toMatch(/zod-to-contract|generic schema generator|ZodType/i);
  });

  it("threads structured contracts into location and faction plan/detail prompts", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Signal Base",
              purpose: "Coordinates anomalous signal monitoring.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Signal Base Antenna Deck",
              purpose: "Tracks sky signals from the base roof.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Signal Base",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A sealed ridge facility full of dish arrays and patched corridors. Technicians track impossible bursts while guards keep the lower tunnels closed.",
          tags: ["Signal Array", "Guarded", "Remote"],
          connectedTo: ["Signal Base Antenna Deck"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A wind-scoured roof deck covered in rotating antennas and warning lights. Operators climb here when the base needs a direct read on impossible bursts.",
          tags: ["Signal Array", "Exposed", "Technical"],
          connectedTo: ["Signal Base"],
        },
      });

    await generateLocationsStep(
      fakeReq,
      fakeReq.premise,
      null,
    );

    const locationPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const locationDetailPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;
    const locationSnippets = [
      '"locations": [{ "name"',
      '"purpose"',
      '"isStarting": true',
      '"connectedTo": ["Signal Base"]',
    ];

    expectScaffoldContractBeforeWorldPremise(
      locationPlanPrompt,
      "STRUCTURED_OUTPUT_CONTRACT: scaffold-location.v1",
      locationSnippets,
    );
    expectScaffoldContractBeforeWorldPremise(
      locationDetailPrompt,
      "STRUCTURED_OUTPUT_CONTRACT: scaffold-location.v1",
      locationSnippets,
    );

    mockGenerateObject.mockReset();
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Station Authority",
              purpose: "Controls access to signal data and emergency supplies.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          tags: ["Bureaucratic", "Secretive"],
          goals: ["Suppress anomalous signal evidence"],
          assets: ["Security staff", "Archive clearance"],
          territoryNames: ["Signal Base"],
        },
      });

    await generateFactionsStep(
      fakeReq,
      fakeReq.premise,
      ["Signal Base"],
      null,
    );

    const factionPlanPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const factionDetailPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;
    const factionSnippets = [
      '"factions": [{ "name"',
      '"purpose"',
      '"goals": ["Suppress anomalous signal evidence"]',
      '"territoryNames": ["Signal Base"]',
    ];

    expectScaffoldContractBeforeWorldPremise(
      factionPlanPrompt,
      "STRUCTURED_OUTPUT_CONTRACT: scaffold-faction.v1",
      factionSnippets,
    );
    expectScaffoldContractBeforeWorldPremise(
      factionDetailPrompt,
      "STRUCTURED_OUTPUT_CONTRACT: scaffold-faction.v1",
      factionSnippets,
    );
  });

  it("requests explicit dense location hierarchy and returns plan hierarchy fields", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Shibuya",
              purpose: "Dense macro district where the incident concentrates.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Shibuya Station Platform",
              purpose: "Contained transit scene where trapped civilians gather.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Shibuya",
            },
            {
              name: "Dogenzaka Alley",
              purpose: "Contained side-street scene used for ambushes.",
              isStarting: false,
              kind: "persistent_sublocation",
              parentLocationName: "Shibuya",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A ward-scale crossing and station district packed with emergency barricades. Sorcerers, commuters, and patrol teams move through the wider macro area under pressure.",
          tags: ["Urban", "Crowded", "Dangerous"],
          connectedTo: ["Shibuya Station Platform"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A lower rail platform sealed behind ticket gates and emergency tape. Civilians and responders are trapped around stopped trains while threats move through service corridors.",
          tags: ["Transit", "Contained", "Crowded"],
          connectedTo: ["Shibuya"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A narrow commercial side street branching off the main crossing. Small groups use shuttered storefronts and blind corners to hide from the wider chaos.",
          tags: ["Alley", "Ambush", "Commercial"],
          connectedTo: ["Shibuya"],
        },
      });

    const result = await generateLocationsStep(
      fakeReq,
      "A dense occult incident spreads across Shibuya without putting every actor in one room.",
      null,
    );

    const planPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const detailPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;

    for (const prompt of [planPrompt, detailPrompt]) {
      expectScaffoldContractBeforeWorldPremise(
        prompt,
        "STRUCTURED_OUTPUT_CONTRACT: scaffold-location.v1",
        [
          '"kind": "macro"',
          '"kind": "persistent_sublocation"',
          '"parentLocationName": null',
          '"parentLocationName": "Signal Base"',
        ],
      );
      expect(prompt).toContain("macro places plus physically contained persistent sublocations");
      expect(prompt).toContain("5-12 total location rows");
      expect(prompt).toContain("no more than 6 macro rows");
      expect(prompt).toContain("no more than 6 persistent sublocation rows");
      expect(prompt).toContain("no more than 3 generated sublocations under any one macro");
      expect(prompt).toContain("parentLocationName must exactly match a generated macro location name");
      expect(prompt).toContain("Do not infer source, canon, franchise, or hierarchy meaning from raw names");
    }

    expect(result).toEqual([
      expect.objectContaining({
        name: "Shibuya",
        kind: "macro",
        parentLocationName: null,
      }),
      expect.objectContaining({
        name: "Shibuya Station Platform",
        kind: "persistent_sublocation",
        parentLocationName: "Shibuya",
      }),
      expect.objectContaining({
        name: "Dogenzaka Alley",
        kind: "persistent_sublocation",
        parentLocationName: "Shibuya",
      }),
    ]);
  });

  it("repairs multi-macro location plans that would leave a macro without playable sublocations", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Tokyo Jujutsu High",
              purpose: "Campus macro where sorcerers train.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Training Grounds",
              purpose: "Contained sparring field inside the campus.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Tokyo Jujutsu High",
            },
            {
              name: "Shibuya",
              purpose: "Dense district where the incident concentrates.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Tokyo Jujutsu High",
              purpose: "Campus macro where sorcerers train.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Training Grounds",
              purpose: "Contained sparring field inside the campus.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Tokyo Jujutsu High",
            },
            {
              name: "Shibuya",
              purpose: "Dense district where the incident concentrates.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Shibuya Station Concourse",
              purpose: "Contained transit scene inside Shibuya where civilians and sorcerers cross paths.",
              isStarting: false,
              kind: "persistent_sublocation",
              parentLocationName: "Shibuya",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A guarded school campus wrapped in old trees and barrier wards. Students and teachers train there while handlers coordinate missions.",
          tags: ["School", "Guarded", "Occult"],
          connectedTo: ["Training Grounds"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A worn sparring field behind the classrooms. Students test techniques here under teacher supervision.",
          tags: ["Training", "Contained", "Open"],
          connectedTo: ["Tokyo Jujutsu High"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A wet neon district spreading around the crossing and station. Civilians, sorcerers, and hostile actors move through the wider area.",
          tags: ["Urban", "Crowded", "Dangerous"],
          connectedTo: ["Shibuya Station Concourse"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A packed station concourse under electric signage and rain-damp stairs. Small groups can meet, hide, or clash without occupying the whole district.",
          tags: ["Transit", "Crowded", "Contained"],
          connectedTo: ["Shibuya"],
        },
      });

    const result = await generateLocationsStep(
      fakeReq,
      "A Jujutsu Kaisen pre-Shibuya world with dense school and district scenes.",
      null,
    );

    const repairPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;

    expect(repairPrompt).toContain("LOCATION TOPOLOGY REPAIR REQUIRED");
    expect(repairPrompt).toContain('Macro "Shibuya" has no persistent_sublocation child');
    expect(result).toEqual([
      expect.objectContaining({ name: "Tokyo Jujutsu High", kind: "macro" }),
      expect.objectContaining({
        name: "Training Grounds",
        kind: "persistent_sublocation",
        isStarting: true,
        parentLocationName: "Tokyo Jujutsu High",
      }),
      expect.objectContaining({ name: "Shibuya", kind: "macro" }),
      expect.objectContaining({
        name: "Shibuya Station Concourse",
        kind: "persistent_sublocation",
        parentLocationName: "Shibuya",
      }),
    ]);
  });

  it("normalizes missing starting flags instead of failing location generation", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Observation Deck",
              purpose: "Monitors deep-space signals.",
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Maintenance Tunnels",
              purpose: "Connects the station's critical systems.",
              kind: "persistent_sublocation",
              parentLocationName: "Observation Deck",
            },
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
    expect(result[0]?.isStarting).toBe(false);
    expect(result[1]?.isStarting).toBe(true);
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

  it("uses artifact source rules for location prompts instead of legacy Naruto world structure", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Tokyo Jujutsu High",
              purpose: "The central school and mission hub for young sorcerers.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Tokyo Jujutsu High Training Grounds",
              purpose: "Contained campus scene where students drill techniques.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Tokyo Jujutsu High",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A guarded campus in Tokyo where sorcerers train under threat of curses. Teachers, students, and handlers coordinate missions from its classrooms and barrier-protected grounds.",
          tags: ["School", "Occult", "Guarded"],
          connectedTo: ["Tokyo Jujutsu High Training Grounds"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A controlled practice field inside the campus barriers. Students and teachers test cursed techniques here before live missions.",
          tags: ["Training", "Occult", "Contained"],
          connectedTo: ["Tokyo Jujutsu High"],
        },
      });

    await generateLocationsStep(
      {
        ...fakeReq,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      pollutedMixedIpContext,
    );

    const planPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const detailPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;

    expectArtifactRulesForTarget(planPrompt, "locations");
    expectArtifactRulesForTarget(detailPrompt, "locations");
    expectNoNarutoWorldStructure(planPrompt);
    expectNoNarutoWorldStructure(detailPrompt);
  });

  it("uses artifact source rules for faction prompts instead of legacy Naruto political structures", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Jujutsu Headquarters",
              purpose: "The conservative authority directing sorcerer policy and missions.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          tags: ["Conservative", "Secretive"],
          goals: ["Contain the chakra-overlay anomaly without exposing curses to civilians"],
          assets: ["Mission bureaucracy", "Sorcerer grade authority"],
          territoryNames: ["Tokyo Jujutsu High"],
        },
      });

    await generateFactionsStep(
      {
        ...fakeReq,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High", "Shibuya"],
      pollutedMixedIpContext,
    );

    const planPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    const detailPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;

    expectArtifactRulesForTarget(planPrompt, "factions");
    expectArtifactRulesForTarget(detailPrompt, "factions");
    expectNoNarutoWorldStructure(planPrompt);
    expectNoNarutoWorldStructure(detailPrompt);
  });

  it("uses artifact source rules for refined premise prompts instead of stale legacy canon", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        refinedPremise:
          "Tokyo Jujutsu High remains the setting anchor while chakra-style mechanics alter how sorcerers train and fight curses.",
      },
    });

    await generateRefinedPremiseStep(
      {
        ...fakeReq,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      pollutedMixedIpContext,
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectArtifactRulesForTarget(prompt, "refined premise");
    expectNoNarutoWorldStructure(prompt);
    expect(prompt).not.toContain("Canonical subject");
  });

  it("emits artifact source rules for locations and factions even when ipContext is null", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Tokyo Jujutsu High",
              purpose: "The school anchoring the occult mission structure.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Tokyo Jujutsu High Dormitory",
              purpose: "Contained campus scene where students begin and return between missions.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Tokyo Jujutsu High",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A barrier-protected campus in Tokyo where sorcerers train and receive missions. Students and teachers monitor curse incidents from its classrooms and dormitories.",
          tags: ["School", "Occult"],
          connectedTo: ["Tokyo Jujutsu High Dormitory"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A quiet dormitory wing inside the guarded campus. Students gather here before patrols and recover after curse incidents.",
          tags: ["Dormitory", "Occult", "Contained"],
          connectedTo: ["Tokyo Jujutsu High"],
        },
      });

    await generateLocationsStep(
      {
        ...fakeReq,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      null,
    );

    const locationPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectArtifactRulesForTarget(locationPrompt, "locations");

    mockGenerateObject.mockReset();
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Jujutsu Headquarters",
              purpose: "The authority shaping sorcerer law and assignments.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          tags: ["Conservative", "Bureaucratic"],
          goals: ["Control disclosure of the chakra-overlay anomaly"],
          assets: ["Mission dispatch", "Sorcerer grade records"],
          territoryNames: ["Tokyo Jujutsu High"],
        },
      });

    await generateFactionsStep(
      {
        ...fakeReq,
        premise: jjkWithNarutoPowerSystemArtifact.rawPremise,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      ["Tokyo Jujutsu High"],
      null,
    );

    const factionPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectArtifactRulesForTarget(factionPrompt, "factions");
  });

  it("uses artifact source rules for validation context and v2 sufficiency during scaffold orchestration", async () => {
    const originalArtifact = cloneJjkNarutoArtifact();
    const enrichedArtifact = makeArtifactWith((artifact) => {
      artifact.generatedContext.keyFacts.push("Kyoto Jujutsu High remains a secondary sorcerer institution.");
    });

    const mockInterpretPremiseDivergence = vi.fn().mockResolvedValue(null);
    const mockGenerateRefinedPremiseStep = vi
      .fn()
      .mockResolvedValue("Tokyo sorcerer institutions adapt to chakra-style technique rules.");
    const mockGenerateLocationsStep = vi.fn().mockResolvedValue([
      {
        name: "Tokyo Jujutsu High",
        description: "A guarded sorcerer school.",
        tags: ["School"],
        isStarting: true,
        connectedTo: [],
      },
    ]);
    const mockGenerateFactionsStep = vi.fn().mockResolvedValue([
      {
        name: "Jujutsu Headquarters",
        tags: ["Conservative"],
        goals: ["Regulate the imported chakra framework"],
        assets: ["Mission orders"],
        territoryNames: ["Tokyo Jujutsu High"],
      },
    ]);
    const mockGenerateNpcsStep = vi.fn().mockResolvedValue([
      {
        name: "Yuji Itadori",
        persona: "A student trying to reconcile cursed energy with chakra control.",
        tags: ["Student"],
        goals: { shortTerm: ["Train safely"], longTerm: ["Protect civilians"] },
        locationName: "Tokyo Jujutsu High",
        factionName: "Jujutsu Headquarters",
        tier: "key" as const,
      },
    ]);
    const mockExtractLoreCards = vi.fn().mockResolvedValue([
      { term: "Tokyo Jujutsu High", definition: "A school.", category: "location" as const },
    ]);
    const mockEvaluateResearchSufficiency = vi.fn(async (ctx: unknown) => ctx);
    const mockEvaluateResearchArtifactSufficiency = vi.fn(async () => enrichedArtifact);

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
      evaluateResearchArtifactSufficiency: mockEvaluateResearchArtifactSufficiency,
    }));
    vi.doMock("../../lib/index.js", () => ({
      createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      })),
    }));

    mockGenerateObject.mockResolvedValue({
      object: { issues: [], summary: "clean" },
    });

    const { generateWorldScaffold } = await import("../scaffold-generator.js");

    const result = await generateWorldScaffold({
      ...fakeReq,
      premise: originalArtifact.rawPremise,
      ipContext: pollutedMixedIpContext,
      researchArtifact: originalArtifact,
      judgeRole: fakeReq.role,
      research: { enabled: true, searchProvider: "brave", maxSearchSteps: 3 },
    });

    expect(mockEvaluateResearchSufficiency).not.toHaveBeenCalled();
    expect(mockEvaluateResearchArtifactSufficiency).toHaveBeenCalledTimes(3);
    expect(mockGenerateLocationsStep.mock.calls[0]?.[0]).toMatchObject({
      researchArtifact: enrichedArtifact,
    });
    expect(mockExtractLoreCards.mock.calls[0]?.[2]).toMatchObject({
      ipContext: pollutedMixedIpContext,
      researchArtifact: enrichedArtifact,
    });
    expect(result.researchArtifact).toBe(enrichedArtifact);

    const validationPrompts = mockGenerateObject.mock.calls
      .map((call) => (call[0] as Record<string, unknown>).prompt as string)
      .join("\n---\n");
    expect(validationPrompts).toContain("RESEARCH CONTEXT FOR VALIDATION");
    expect(validationPrompts).toContain("Jujutsu Kaisen: role=world_basis");
    expect(validationPrompts).toContain("Naruto: role=mechanics_overlay");
    expect(validationPrompts).not.toContain("Canonical subject");
    expect(validationPrompts).not.toContain("FRANCHISE REFERENCE");
  });

  it("uses artifact source rules for validation regeneration prompts instead of legacy franchise references", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        description:
          "A barrier-protected campus where sorcerers test chakra-shaped cursed techniques under strict supervision.",
        tags: ["School", "Occult", "Training"],
        connectedTo: [],
      },
    });

    await regenerateLocationEntity(
      {
        name: "Tokyo Jujutsu High",
        description: "A school.",
        tags: ["School"],
        isStarting: true,
        connectedTo: [],
      },
      "Remove imported Naruto geography from this location.",
      {
        ...fakeReq,
        researchArtifact: jjkWithNarutoPowerSystemArtifact,
      },
      jjkWithNarutoPowerSystemArtifact.rawPremise,
      pollutedMixedIpContext,
      [
        {
          name: "Tokyo Jujutsu High",
          description: "A school.",
          tags: ["School"],
          isStarting: true,
          connectedTo: [],
        },
      ],
    );

    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expectArtifactRulesForTarget(prompt, "regeneration");
    expectNoNarutoWorldStructure(prompt);
    expectScaffoldContractBeforeWorldPremise(
      prompt,
      "STRUCTURED_OUTPUT_CONTRACT: scaffold-regeneration.v1",
      [
        '"description"',
        '"connectedTo": ["Tokyo Jujutsu High"]',
        '"goals": { "shortTerm"',
        '"territoryNames": ["Tokyo Jujutsu High"]',
        '"persona"',
      ],
    );
  });

  it("keeps legacy no-artifact location and faction prompt authority wording stable", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          locations: [
            {
              name: "Konohagakure",
              purpose: "The main governing shinobi village.",
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Konohagakure Training Grounds",
              purpose: "Contained village scene where shinobi teams drill and gather.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Konohagakure",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A walled village centered on the Hokage offices and shinobi training grounds. Clan compounds, markets, and mission desks keep the village operating under constant military pressure.",
          tags: ["Fortified", "Shinobi"],
          connectedTo: ["Konohagakure Training Grounds"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A fenced training field inside the village where teams practice techniques before missions. Instructors and genin cycle through drills under watchful supervision.",
          tags: ["Training", "Shinobi", "Contained"],
          connectedTo: ["Konohagakure"],
        },
      });

    await generateLocationsStep(
      { ...fakeReq, researchArtifact: null },
      "Naruto, but Sakura was trained by Orochimaru.",
      {
        franchise: "Naruto",
        keyFacts: ["Konohagakure remains one of the Five Great Shinobi Villages."],
        tonalNotes: ["Shonen action"],
        canonicalNames: {
          locations: ["Konohagakure"],
          factions: ["Konohagakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno"],
        },
        source: "mcp",
      },
    );

    const locationPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(locationPrompt).toContain("You are writing a location reference for the Naruto universe.");
    expect(locationPrompt).toContain("CANONICAL LOCATIONS FROM NARUTO");
    expect(locationPrompt).toContain("LEGACY IP REFERENCE (Naruto, verified via mcp)");
    expect(locationPrompt).toContain("Use this legacy IP reference as selected source context");

    mockGenerateObject.mockReset();
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          factions: [
            {
              name: "Konohagakure",
              purpose: "The village government and military structure.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          tags: ["Militaristic", "Disciplined"],
          goals: ["Contain the altered Sakura alliance"],
          assets: ["ANBU", "Hokage office"],
          territoryNames: ["Konohagakure"],
        },
      });

    await generateFactionsStep(
      { ...fakeReq, researchArtifact: null },
      "Naruto, but Sakura was trained by Orochimaru.",
      ["Konohagakure"],
      {
        franchise: "Naruto",
        keyFacts: ["Konohagakure remains one of the Five Great Shinobi Villages."],
        tonalNotes: ["Shonen action"],
        canonicalNames: {
          locations: ["Konohagakure"],
          factions: ["Konohagakure"],
          characters: ["Naruto Uzumaki", "Sakura Haruno"],
        },
        source: "mcp",
      },
    );

    const factionPrompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(factionPrompt).toContain("You are writing a faction reference for the Naruto universe.");
    expect(factionPrompt).toContain("CANONICAL FACTIONS FROM NARUTO");
    expect(factionPrompt).toContain("LEGACY IP REFERENCE (Naruto, verified via mcp)");
    expect(factionPrompt).toContain("Use this legacy IP reference as selected source context");
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

  it("falls back to plain-text refined premise for current safeGenerateObject errors", async () => {
    mockGenerateObject.mockRejectedValueOnce(
      new Error(
        "safeGenerateObject: Zod validation failed.\nErrors: [refinedPremise] Invalid input: expected string, received object",
      ),
    );
    mockGenerateText.mockResolvedValueOnce({
      text:
        "The city remains locked under a supernatural curfew while the academy factions argue over who controls the next mission. The player's arrival shifts the balance without rewriting the current world state.",
    });

    const refinedPremise = await generateRefinedPremiseStep(
      {
        ...fakeReq,
        premise: "Urban occult academy under curfew.",
      },
      null,
    );

    expect(refinedPremise).toContain("supernatural curfew");
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
              isStarting: false,
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Signal Base Control Room",
              purpose: "Contained operations scene where the replacement operator begins work.",
              isStarting: true,
              kind: "persistent_sublocation",
              parentLocationName: "Signal Base",
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
          connectedTo: ["Signal Base Control Room"],
        },
      })
      .mockResolvedValueOnce({
        object: {
          description:
            "A cramped operations room packed with signal monitors and handwritten calibration notes. The replacement operator takes over daily anomaly watches from this contained workspace.",
          tags: ["Technical", "Contained", "Operational"],
          connectedTo: ["Signal Base"],
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
        connectedTo: ["Signal Base Antenna Deck"],
        kind: "macro" as const,
        parentLocationName: null,
      },
      {
        name: "Signal Base Antenna Deck",
        description: "The roof platform holding the station's dish array.",
        tags: ["Exposed"],
        isStarting: false,
        connectedTo: ["Signal Base"],
        kind: "persistent_sublocation" as const,
        parentLocationName: "Signal Base",
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
    {
      const call = mockGenerateLocationsStep.mock.calls[0]!;
      expect(call[0]).toMatchObject({ premiseDivergence });
      expect(call[1]).toBe("Signal Base remains operational under new leadership.");
      expect(call[2]).toEqual(ipContext);
    }
    {
      const call = mockGenerateFactionsStep.mock.calls[0]!;
      expect(call[0]).toMatchObject({ premiseDivergence });
      expect(call[1]).toBe("Signal Base remains operational under new leadership.");
      expect(call[2]).toEqual(["Signal Base", "Signal Base Antenna Deck"]);
      expect(call[3]).toEqual(ipContext);
    }
    {
      const call = mockGenerateNpcsStep.mock.calls[0]!;
      expect(call[0]).toMatchObject({ premiseDivergence });
      expect(call[1]).toBe("Signal Base remains operational under new leadership.");
      expect(call[2]).toEqual([
        expect.objectContaining({
          name: "Signal Base",
          kind: "macro",
          parentLocationName: null,
        }),
        expect.objectContaining({
          name: "Signal Base Antenna Deck",
          kind: "persistent_sublocation",
          parentLocationName: "Signal Base",
        }),
      ]);
      expect(call[3]).toEqual(["Research Staff"]);
      expect(call[4]).toEqual(ipContext);
    }
    {
      const call = mockExtractLoreCards.mock.calls[0]!;
      expect(call[0]).toMatchObject({ refinedPremise: "Signal Base remains operational under new leadership." });
      expect(call[1]).toEqual(fakeReq.role);
      expect(call[2]).toMatchObject({
        ipContext,
        premiseDivergence,
        researchArtifact: null,
      });
    }
  });
});
