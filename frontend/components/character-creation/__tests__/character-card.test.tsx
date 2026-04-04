import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCard } from "../character-card";
import type { CharacterDraft } from "@worldforge/shared";

const MOCK_DRAFT: CharacterDraft = {
  identity: {
    role: "player",
    tier: "key",
    displayName: "Elara Nightwhisper",
    canonicalStatus: "original",
  },
  profile: {
    species: "Half-Elf",
    gender: "Female",
    ageText: "Young adult",
    appearance: "Tall with silver hair and violet eyes",
    backgroundSummary: "A scout from the northern borders.",
    personaSummary: "Quiet, observant, and slow to trust.",
  },
  socialContext: {
    factionId: null,
    factionName: null,
    homeLocationId: null,
    homeLocationName: null,
    currentLocationId: null,
    currentLocationName: "Rivendell",
    relationshipRefs: [],
    socialStatus: ["wayfinder"],
    originMode: "native",
  },
  motivations: {
    shortTermGoals: ["Find her brother"],
    longTermGoals: ["Protect the valley"],
    beliefs: [],
    drives: ["Duty"],
    frictions: ["Distrusts nobility"],
  },
  capabilities: {
    traits: ["stealth", "cunning"],
    skills: [{ name: "archery", tier: "Skilled" }],
    flaws: ["restless"],
    specialties: [],
    wealthTier: null,
  },
  state: {
    hp: 3,
    conditions: [],
    statusFlags: [],
    activityState: "idle",
  },
  loadout: {
    inventorySeed: ["Short bow", "Leather armor"],
    equippedItemRefs: ["Short bow", "Leather armor"],
    currencyNotes: "",
    signatureItems: ["Short bow"],
  },
  startConditions: {
    sourcePrompt: "",
  },
  provenance: {
    sourceKind: "player-input",
    importMode: null,
    templateId: null,
    archetypePrompt: null,
    worldgenOrigin: null,
    legacyTags: ["stealth", "archery", "cunning"],
  },
};

const MOCK_LOCATIONS = ["Rivendell", "Moria", "Bree"];

describe("CharacterCard", () => {
  it("renders all character fields", () => {
    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
        onResolveStartingLocation={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Elara Nightwhisper")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Half-Elf")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Female")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Young adult")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Tall with silver hair and violet eyes")
    ).toBeInTheDocument();
  });

  it("renders HP display with correct count", () => {
    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
        onResolveStartingLocation={vi.fn()}
      />
    );

    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
        onResolveStartingLocation={vi.fn()}
      />
    );

    expect(screen.getByText("stealth")).toBeInTheDocument();
    expect(screen.getByText("cunning")).toBeInTheDocument();
  });

  it("renders equipped items", () => {
    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
        onResolveStartingLocation={vi.fn()}
      />
    );

    expect(screen.getByText("Short bow")).toBeInTheDocument();
    expect(screen.getByText("Leather armor")).toBeInTheDocument();
  });

  it("calls onChange with updated character when name is edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={onChange}
        onResolveStartingLocation={vi.fn()}
      />
    );

    const nameInput = screen.getByDisplayValue("Elara Nightwhisper");
    await user.type(nameInput, "X");

    // onChange is debounced — wait for it
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 500 });
    const call = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(call.identity.displayName).toBe("Elara NightwhisperX");
    expect(call.profile.species).toBe("Half-Elf");
    expect(call.state.hp).toBe(3);
  });

  it("renders all label text", () => {
    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={vi.fn()}
        onResolveStartingLocation={vi.fn()}
      />
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
    expect(screen.getByText("First Impression")).toBeInTheDocument();
    expect(screen.getByText("HP")).toBeInTheDocument();
    expect(screen.getByText("Traits")).toBeInTheDocument();
    expect(screen.getByText("Flaws")).toBeInTheDocument();
    expect(screen.getByText("Equipped Items")).toBeInTheDocument();
    expect(screen.getByText("Starting Situation")).toBeInTheDocument();
  });

  it("lets the user describe starting situation and apply it", async () => {
    const onPromptChange = vi.fn();
    const onResolve = vi.fn();
    const user = userEvent.setup();

    render(
      <CharacterCard
        draft={MOCK_DRAFT}
        locationNames={MOCK_LOCATIONS}
        onChange={(draft) => onPromptChange(draft.startConditions.sourcePrompt)}
        onResolveStartingLocation={onResolve}
      />
    );

    await user.type(
      screen.getByPlaceholderText(/I arrive at the station at dusk/i),
      "Arrive during a storm",
    );
    await user.click(screen.getByRole("button", { name: "Apply Start" }));

    // onChange is debounced — wait for it
    await vi.waitFor(() => expect(onPromptChange).toHaveBeenCalled(), { timeout: 500 });
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
