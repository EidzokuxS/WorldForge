// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft, PowerStats } from "@worldforge/shared";
import type { CharacterResult, ScaffoldLocation, ScaffoldNpc } from "@/lib/api-types";
import { NpcsSection } from "../npcs-section";

const MOCK_POWER_STATS: PowerStats = {
  attackPotency: { tier: "Wall", rank: 5 },
  speed: { tier: "Street", rank: 4 },
  durability: { tier: "Wall", rank: 4 },
  intelligence: { tier: "Gifted", rank: 6 },
  hax: [],
  vulnerabilities: [
    {
      description: "Loses formation discipline when separated from the ridge watch.",
      severity: "major",
    },
  ],
};

type ParseCharacter = typeof import("@/lib/api").parseCharacter;
type ImportV2Card = typeof import("@/lib/api").importV2Card;
type ResearchCharacter = typeof import("@/lib/api").researchCharacter;
type GenerateCharacter = typeof import("@/lib/api").generateCharacter;
type ParseV2CardFile = typeof import("@/lib/v2-card-parser").parseV2CardFile;

const apiMocks = vi.hoisted(() => ({
  parseCharacter: vi.fn<ParseCharacter>(),
  importV2Card: vi.fn<ImportV2Card>(),
  researchCharacter: vi.fn<ResearchCharacter>(),
  generateCharacter: vi.fn<GenerateCharacter>(),
  parseV2CardFile: vi.fn<ParseV2CardFile>(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../regenerate-dialog", () => ({
  RegenerateDialog: () => <button type="button">Regenerate</button>,
}));

vi.mock("../tag-editor", () => ({
  TagEditor: () => <div data-testid="tag-editor" />,
}));

vi.mock("../string-list-editor", () => ({
  StringListEditor: () => <div data-testid="string-list-editor" />,
}));

vi.mock("@/lib/api", () => ({
  parseCharacter: apiMocks.parseCharacter,
  importV2Card: apiMocks.importV2Card,
  researchCharacter: apiMocks.researchCharacter,
  generateCharacter: apiMocks.generateCharacter,
  IngestionError: class IngestionError extends Error {
    stage?: string;
    attempts?: number;
    constructor(message: string, stage?: string, attempts?: number) {
      super(message);
      this.name = "IngestionError";
      this.stage = stage;
      this.attempts = attempts;
    }
  },
}));

vi.mock("@/lib/v2-card-parser", () => ({
  parseV2CardFile: apiMocks.parseV2CardFile,
}));

vi.mock("sonner", () => ({
  toast: {
    success: apiMocks.toastSuccess,
    error: apiMocks.toastError,
  },
}));

beforeAll(() => {
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    value: vi.fn(() => false),
    configurable: true,
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  });
});

const makeDraft = (overrides: Partial<CharacterDraft> = {}): CharacterDraft => ({
  identity: {
    role: "npc",
    tier: "key",
    displayName: "Draft NPC",
    canonicalStatus: "original",
    personality: {
      summary: "A sand-scoured watch officer from Dunespire Hold.",
      voice: "Short commands, little patience, clipped field reports.",
      decisionStyle: "Makes the call fast and fixes the fallout later.",
      worldview: "A bad map kills faster than a bad blade.",
      internalContradictions: [
        "Demands discipline, but keeps breaking protocol to shield rookies.",
      ],
      personalMythology: "If I see the breach first, the city survives.",
      sampleLines: ["Hold the ridge.", "Report, then move."],
    },
    ...(overrides.identity ?? {}),
  },
  profile: {
    species: "",
    gender: "",
    ageText: "",
    appearance: "",
    backgroundSummary: "",
    personaSummary: "A capable operator",
    ...(overrides.profile ?? {}),
  },
  socialContext: {
    factionId: null,
    factionName: null,
    homeLocationId: null,
    homeLocationName: null,
    currentLocationId: null,
    currentLocationName: "Tavern",
    relationshipRefs: [],
    socialStatus: [],
    originMode: "resident",
    ...(overrides.socialContext ?? {}),
  },
  motivations: {
    shortTermGoals: ["Keep order"],
    longTermGoals: ["Hold the city"],
    beliefs: [],
    drives: [],
    frictions: [],
    ...(overrides.motivations ?? {}),
  },
  capabilities: {
    traits: [],
    skills: [],
    flaws: [],
    specialties: [],
    wealthTier: null,
    ...(overrides.capabilities ?? {}),
  },
  state: {
    hp: 5,
    conditions: [],
    statusFlags: [],
    activityState: "active",
    ...(overrides.state ?? {}),
  },
  loadout: {
    inventorySeed: [],
    equippedItemRefs: [],
    currencyNotes: "",
    signatureItems: [],
    ...(overrides.loadout ?? {}),
  },
  startConditions: {
    ...(overrides.startConditions ?? {}),
  },
  provenance: {
    sourceKind: "worldgen",
    importMode: null,
    templateId: null,
    archetypePrompt: null,
    worldgenOrigin: null,
    legacyTags: [],
    ...(overrides.provenance ?? {}),
  },
  powerStats: overrides.powerStats,
});

const makeNpc = (overrides: Partial<ScaffoldNpc> = {}): ScaffoldNpc => ({
  _uid: "npc-1",
  name: "Marshal Vale",
  persona: "Keeps the gates secure.",
  tags: ["guard captain"],
  goals: { shortTerm: ["Inspect the docks"], longTerm: ["Keep the peace"] },
  locationName: "Tavern",
  sceneLocationName: null,
  factionName: null,
  tier: "key",
  draft: makeDraft({
    identity: { role: "npc", tier: "key", displayName: "Marshal Vale", canonicalStatus: "original" },
    profile: { species: "", gender: "", ageText: "", appearance: "", backgroundSummary: "", personaSummary: "Keeps the gates secure." },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Tavern",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: ["Inspect the docks"],
      longTermGoals: ["Keep the peace"],
      beliefs: [],
      drives: [],
      frictions: [],
    },
  }),
  ...overrides,
});

function makeCharacterResultNpc(
  overrides: Partial<ScaffoldNpc> = {},
  tier: "key" | "supporting" = "key",
): Extract<CharacterResult, { role: "key" }> {
  const npc = makeNpc({
    _uid: undefined,
    tier,
    draft: makeDraft({
      identity: {
        role: "npc",
        tier,
        displayName: overrides.name ?? "Created NPC",
        canonicalStatus: "original",
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: overrides.persona ?? "Generated from helper flow.",
      },
      socialContext: {
        factionId: null,
        factionName: overrides.factionName ?? null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: overrides.locationName ?? "Tavern",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: overrides.goals?.shortTerm ?? [],
        longTermGoals: overrides.goals?.longTerm ?? [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
    }),
    ...overrides,
  });

  return {
    role: "key",
    draft: npc.draft as CharacterDraft,
    npc,
  };
}

function renderSection(overrides: Partial<ComponentProps<typeof NpcsSection>> = {}) {
  const props: ComponentProps<typeof NpcsSection> = {
    npcs: [makeNpc(), makeNpc({ _uid: "npc-2", name: "Dockhand Mira", tier: "supporting", draft: makeDraft({
      identity: { role: "npc", tier: "supporting", displayName: "Dockhand Mira", canonicalStatus: "original" },
      profile: { species: "", gender: "", ageText: "", appearance: "", backgroundSummary: "", personaSummary: "Knows every ship in the harbor." },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Forest",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: ["Unload contraband"],
        longTermGoals: ["Pay off her debts"],
        beliefs: [],
        drives: [],
        frictions: [],
      },
    }) })],
    campaignId: "campaign-1",
    locationNames: ["Tavern", "Forest"],
    factionNames: ["The Order"],
    onChange: vi.fn(),
    onRegenerate: vi.fn(),
    regenerating: false,
    ...overrides,
  };

  return {
    ...render(<NpcsSection {...props} />),
    props,
  };
}

async function setCreationTier(user: ReturnType<typeof userEvent.setup>, tier: "key" | "supporting") {
  await user.click(screen.getByRole("button", { name: tier === "key" ? /new npc tier key/i : /new npc tier supporting/i }));
}

describe("NpcsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows each NPC card's visible tier state", () => {
    renderSection();

    const keyGroup = screen.getByRole("group", { name: "Marshal Vale tier" });
    const supportingGroup = screen.getByRole("group", { name: "Dockhand Mira tier" });

    expect(within(keyGroup).getByRole("button", { name: /marshal vale key tier/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(keyGroup).getByText("Key NPC")).toBeInTheDocument();
    expect(within(supportingGroup).getByRole("button", { name: /dockhand mira supporting tier/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(supportingGroup).getByText("Supporting NPC")).toBeInTheDocument();
  });

  it("renders personality between tags and power stats on the npc card", async () => {
    const user = userEvent.setup();
    renderSection({
      npcs: [
        makeNpc({
          draft: makeDraft({
            identity: {
              role: "npc",
              tier: "key",
              displayName: "Marshal Vale",
              canonicalStatus: "original",
              personality: makeDraft().identity.personality,
            },
            powerStats: MOCK_POWER_STATS,
          }),
        }),
      ],
    });

    const card = screen.getByTestId("npc-card");
    const tagsHeading = within(card).getByText(/^tags$/i);
    const personality = within(card).getByRole("region", { name: /personality/i });
    const powerStatsHeading = within(card).getByText(/^power stats$/i);
    const powerStats = powerStatsHeading.closest("div");

    await user.click(
      within(card).getByRole("button", { name: /personality details/i }),
    );

    expect(
      within(personality).getByText(/A sand-scoured watch officer from Dunespire Hold\./i),
    ).toBeInTheDocument();
    expect(
      tagsHeading.compareDocumentPosition(personality) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(powerStats).not.toBeNull();
    expect(
      personality.compareDocumentPosition(powerStats as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not render PowerStatsSection when scaffold NPC draft.powerStats is null", () => {
    renderSection({
      npcs: [
        makeNpc({
          draft: makeDraft({
            identity: {
              role: "npc",
              tier: "key",
              displayName: "Marshal Vale",
              canonicalStatus: "original",
            },
            powerStats: null,
          }),
        }),
      ],
    });

    expect(screen.queryByText(/^power stats$/i)).not.toBeInTheDocument();
  });

  it("syncs scaffold tier and draft identity tier when the tier changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSection({
      npcs: [makeNpc()],
      onChange,
    });

    await user.click(screen.getByRole("button", { name: /marshal vale supporting tier/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
    expect(updatedNpc.tier).toBe("supporting");
    expect(updatedNpc.draft?.identity.tier).toBe("supporting");
  });

  it("aligns broad NPC location when scene placement selects a macro location", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSection({
      npcs: [makeNpc({ sceneLocationName: "Forest" })],
      locationNames: ["Tavern", "Forest", "Cellar"],
      onChange,
    });

    await user.click(screen.getByRole("combobox", { name: /scene for marshal vale/i }));
    await user.click(await screen.findByRole("option", { name: "Cellar" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
    expect(updatedNpc.locationName).toBe("Cellar");
    expect(updatedNpc.sceneLocationName).toBe("Cellar");
  });

  it("keeps broad NPC location choices macro-only while scene choices include sublocations", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const locations: ScaffoldLocation[] = [
      {
        name: "Tavern",
        description: "",
        tags: [],
        isStarting: true,
        connectedTo: [],
        kind: "macro",
        parentLocationName: null,
      },
      {
        name: "Forest",
        description: "",
        tags: [],
        isStarting: false,
        connectedTo: [],
        kind: "macro",
        parentLocationName: null,
      },
      {
        name: "Cellar",
        description: "",
        tags: [],
        isStarting: false,
        connectedTo: ["Tavern"],
        kind: "persistent_sublocation",
        parentLocationName: "Tavern",
      },
    ];

    renderSection({
      npcs: [makeNpc({ locationName: "Forest", sceneLocationName: null })],
      locations,
      locationNames: locations.map((location) => location.name),
      onChange,
    });

    await user.click(screen.getByRole("combobox", { name: /location for marshal vale/i }));
    expect(await screen.findByRole("option", { name: "Tavern" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Forest" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cellar" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("combobox", { name: /scene for marshal vale/i }));
    await user.click(await screen.findByRole("option", { name: "Cellar" }));

    const updatedNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
    expect(updatedNpc.locationName).toBe("Tavern");
    expect(updatedNpc.sceneLocationName).toBe("Cellar");
  });

  it("adds a blank supporting NPC by default instead of silently creating a key NPC", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSection({
      npcs: [],
      onChange,
    });

    await user.click(screen.getByRole("button", { name: /add npc/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const createdNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
    expect(createdNpc.name).toBe("");
    expect(createdNpc.tier).toBe("supporting");
    expect(createdNpc.draft?.identity.tier).toBe("supporting");
  });

  it.each([
    {
      name: "Describe",
      trigger: /describe character from free text/i,
      complete: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByPlaceholderText(/grizzled old blacksmith/i), "A grim harbor fixer");
        await user.click(screen.getByRole("button", { name: /^parse$/i }));
      },
      calledWith: () => expect(apiMocks.parseCharacter).toHaveBeenCalledWith("campaign-1", "A grim harbor fixer", "key", ["Tavern", "Forest"], ["The Order"], ""),
    },
    {
      name: "Import V2 Card",
      trigger: /import sillytavern/i,
      complete: async (user: ReturnType<typeof userEvent.setup>) => {
        apiMocks.parseV2CardFile.mockResolvedValueOnce({
          name: "Imported NPC",
          description: "Smuggler lieutenant",
          personality: "Calculating",
          scenario: "Works the night docks",
          tags: ["smuggler"],
        });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, new File(['{"name":"Imported NPC"}'], "npc.json", { type: "application/json" }));
      },
      calledWith: () =>
        expect(apiMocks.importV2Card).toHaveBeenCalledWith(
          "campaign-1",
          {
            name: "Imported NPC",
            description: "Smuggler lieutenant",
            personality: "Calculating",
            scenario: "Works the night docks",
            tags: ["smuggler"],
          },
          {
            role: "key",
            importMode: "native",
            locationNames: ["Tavern", "Forest"],
            factionNames: ["The Order"],
            overrideText: "",
          },
        ),
    },
    {
      name: "Research Archetype",
      trigger: /research archetype/i,
      complete: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByPlaceholderText(/mysterious plague doctor/i), "mysterious ferryman");
        await user.click(screen.getByRole("button", { name: /^research$/i }));
      },
      calledWith: () =>
        expect(apiMocks.researchCharacter).toHaveBeenCalledWith(
          "campaign-1",
          "mysterious ferryman",
          "key",
          ["Tavern", "Forest"],
          ["The Order"],
          "",
        ),
    },
    {
      name: "AI Generate",
      trigger: /generate character from scratch/i,
      complete: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: /^generate$/i }));
      },
      calledWith: () =>
        expect(apiMocks.generateCharacter).toHaveBeenCalledWith(
          "campaign-1",
          "key",
          ["Tavern", "Forest"],
          ["The Order"],
          "",
        ),
    },
  ])("$name helper results are retiered locally before they reach component state", async ({ trigger, complete, calledWith }) => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    apiMocks.parseCharacter.mockResolvedValue(
      makeCharacterResultNpc({
        name: "Parsed NPC",
        persona: "Parsed persona",
        draft: makeDraft({
          identity: {
            role: "npc",
            tier: "key",
            displayName: "Parsed NPC",
            canonicalStatus: "original",
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "Parsed persona",
          },
          powerStats: MOCK_POWER_STATS,
        }),
      }),
    );
    apiMocks.importV2Card.mockResolvedValue(
      makeCharacterResultNpc({
        name: "Imported NPC",
        persona: "Imported persona",
        draft: makeDraft({
          identity: {
            role: "npc",
            tier: "key",
            displayName: "Imported NPC",
            canonicalStatus: "original",
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "Imported persona",
          },
          powerStats: MOCK_POWER_STATS,
        }),
      }),
    );
    apiMocks.researchCharacter.mockResolvedValue(
      makeCharacterResultNpc({
        name: "Generated NPC",
        persona: "Generated persona",
        draft: makeDraft({
          identity: {
            role: "npc",
            tier: "key",
            displayName: "Generated NPC",
            canonicalStatus: "original",
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "Generated persona",
          },
          powerStats: MOCK_POWER_STATS,
        }),
      }),
    );
    apiMocks.generateCharacter.mockResolvedValue(
      makeCharacterResultNpc({
        name: "Conjured NPC",
        persona: "Conjured persona",
        draft: makeDraft({
          identity: {
            role: "npc",
            tier: "key",
            displayName: "Conjured NPC",
            canonicalStatus: "original",
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "Conjured persona",
          },
          powerStats: MOCK_POWER_STATS,
        }),
      }),
    );

    renderSection({
      npcs: [],
      onChange,
    });

    await setCreationTier(user, "supporting");
    await user.click(screen.getByRole("tab", { name: trigger }));
    await complete(user);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    calledWith();
    const createdNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
    expect(createdNpc.tier).toBe("supporting");
    expect(createdNpc.draft?.identity.tier).toBe("supporting");
    expect(createdNpc.draft?.powerStats).toEqual(MOCK_POWER_STATS);
  });
});
