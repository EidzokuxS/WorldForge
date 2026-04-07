// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import type { CharacterResult, ScaffoldNpc } from "@/lib/api-types";
import { NpcsSection } from "../npcs-section";

type ParseCharacter = typeof import("@/lib/api").parseCharacter;
type ImportV2Card = typeof import("@/lib/api").importV2Card;
type ResearchCharacter = typeof import("@/lib/api").researchCharacter;
type ParseV2CardFile = typeof import("@/lib/v2-card-parser").parseV2CardFile;

const apiMocks = vi.hoisted(() => ({
  parseCharacter: vi.fn<ParseCharacter>(),
  importV2Card: vi.fn<ImportV2Card>(),
  researchCharacter: vi.fn<ResearchCharacter>(),
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

const makeDraft = (overrides: Partial<CharacterDraft> = {}): CharacterDraft => ({
  identity: {
    role: "npc",
    tier: "key",
    displayName: "Draft NPC",
    canonicalStatus: "original",
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
});

const makeNpc = (overrides: Partial<ScaffoldNpc> = {}): ScaffoldNpc => ({
  _uid: "npc-1",
  name: "Marshal Vale",
  persona: "Keeps the gates secure.",
  tags: ["guard captain"],
  goals: { shortTerm: ["Inspect the docks"], longTerm: ["Keep the peace"] },
  locationName: "Tavern",
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
      trigger: /describe/i,
      complete: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByPlaceholderText(/grizzled old blacksmith/i), "A grim harbor fixer");
        await user.click(screen.getByRole("button", { name: /^parse$/i }));
      },
      calledWith: () => expect(apiMocks.parseCharacter).toHaveBeenCalledWith("campaign-1", "A grim harbor fixer", "key", ["Tavern", "Forest"], ["The Order"]),
    },
    {
      name: "Import V2 Card",
      trigger: /import v2 card/i,
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
          },
        ),
    },
    {
      name: "AI Generate",
      trigger: /ai generate/i,
      complete: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByPlaceholderText(/mysterious plague doctor/i), "mysterious ferryman");
        await user.click(screen.getByRole("button", { name: /^generate$/i }));
      },
      calledWith: () =>
        expect(apiMocks.researchCharacter).toHaveBeenCalledWith(
          "campaign-1",
          "mysterious ferryman",
          "key",
          ["Tavern", "Forest"],
          ["The Order"],
        ),
    },
  ])("$name helper results are retiered locally before they reach component state", async ({ trigger, complete, calledWith }) => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    apiMocks.parseCharacter.mockResolvedValue(makeCharacterResultNpc({ name: "Parsed NPC", persona: "Parsed persona" }));
    apiMocks.importV2Card.mockResolvedValue(makeCharacterResultNpc({ name: "Imported NPC", persona: "Imported persona" }));
    apiMocks.researchCharacter.mockResolvedValue(makeCharacterResultNpc({ name: "Generated NPC", persona: "Generated persona" }));

    renderSection({
      npcs: [],
      onChange,
    });

    await setCreationTier(user, "supporting");
    await user.click(screen.getByRole("button", { name: trigger }));
    await complete(user);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    calledWith();
    const createdNpc = onChange.mock.calls[0][0][0] as ScaffoldNpc;
    expect(createdNpc.tier).toBe("supporting");
    expect(createdNpc.draft?.identity.tier).toBe("supporting");
  });
});
