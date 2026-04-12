import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterDraft } from "@worldforge/shared";
import { CharacterCard } from "../character-card";

const LOCATION_NAMES = ["Harbor", "Citadel", "Archive"];

function makeDraft(): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Captain Mira",
      canonicalStatus: "known_ip_canonical",
      baseFacts: {
        biography: "Veteran harbor marshal who held the breakwater during the Black Tide.",
        socialRole: ["Harbor marshal", "Watch captain"],
        hardConstraints: ["Will not abandon the harbor to smugglers"],
      },
      behavioralCore: {
        motives: ["Protect the harbor"],
        pressureResponses: ["Locks the district down fast"],
        taboos: ["Colluding with smugglers"],
        attachments: ["Her exhausted night watch"],
        selfImage: "A wall between the harbor and chaos.",
      },
      liveDynamics: {
        activeGoals: ["Find the vanished customs ledger"],
        beliefDrift: ["Someone inside the watch is leaking routes"],
        currentStrains: ["Council pressure"],
        earnedChanges: ["Started trusting the rookie quartermaster"],
      },
    },
    profile: {
      species: "Human",
      gender: "Woman",
      ageText: "34",
      appearance: "Scarred officer in a salt-stiff coat",
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: "Harbor Watch",
      homeLocationId: null,
      homeLocationName: "Harbor",
      currentLocationId: null,
      currentLocationName: "Harbor",
      relationshipRefs: [],
      socialStatus: ["respected"],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: ["alert"],
      skills: [],
      flaws: ["unyielding"],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: ["Harbor badge"],
      equippedItemRefs: ["Harbor badge"],
      currencyNotes: "",
      signatureItems: ["Harbor badge"],
    },
    startConditions: {
      sourcePrompt: "I arrive after a night of searching the lower docks.",
    },
    provenance: {
      sourceKind: "import",
      importMode: "native",
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: ["marshal", "watch"],
    },
    sourceBundle: {
      canonSources: [
        {
          kind: "canon",
          label: "Harbor Chronicle",
          excerpt: "Mira held the breakwater through the Black Tide.",
        },
      ],
      secondarySources: [
        {
          kind: "card",
          label: "Community Character Card",
          excerpt: "Gruff protector with a rigid code.",
        },
      ],
      synthesis: {
        owner: "worldforge",
        strategy: "merge",
        notes: ["Preserve watch-captain continuity."],
      },
    },
    continuity: {
      identityInertia: "anchored",
      protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
      mutableSurface: ["identity.liveDynamics"],
      changePressureNotes: ["Needs sustained civic betrayal before deeper drift."],
    },
  };
}

describe("CharacterCard identity fidelity", () => {
  it("surfaces bounded fidelity cues for canonical or imported characters", () => {
    render(
      <CharacterCard
        draft={makeDraft()}
        locationNames={LOCATION_NAMES}
        onChange={vi.fn()}
        onResolveStartingLocation={vi.fn()}
      />,
    );

    expect(screen.getByText("Identity Fidelity")).toBeInTheDocument();
    expect(screen.getByText("Known IP Canonical")).toBeInTheDocument();
    expect(screen.getByText("A wall between the harbor and chaos.")).toBeInTheDocument();
    expect(screen.getByText("Harbor Chronicle")).toBeInTheDocument();
    expect(screen.getByText("Anchored continuity")).toBeInTheDocument();
  });

  it("preserves backend-owned fidelity metadata when editing bounded fields", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CharacterCard
        draft={makeDraft()}
        locationNames={LOCATION_NAMES}
        onChange={onChange}
        onResolveStartingLocation={vi.fn()}
      />,
    );

    await user.type(screen.getByDisplayValue("Captain Mira"), " Ren");

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 500 });
    const nextDraft = onChange.mock.calls.at(-1)?.[0] as CharacterDraft;

    expect(nextDraft.identity.displayName).toBe("Captain Mira Ren");
    expect(nextDraft.identity.behavioralCore?.selfImage).toBe(
      "A wall between the harbor and chaos.",
    );
    expect(nextDraft.identity.liveDynamics?.activeGoals).toEqual([
      "Find the vanished customs ledger",
    ]);
    expect(nextDraft.sourceBundle?.canonSources[0]?.label).toBe("Harbor Chronicle");
    expect(nextDraft.continuity?.identityInertia).toBe("anchored");
  });
});
