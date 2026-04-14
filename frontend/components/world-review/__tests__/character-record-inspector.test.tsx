// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CharacterDraft, CharacterRecord } from "@worldforge/shared";
import { CharacterRecordInspector } from "../character-record-inspector";

function makeDraft(): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: "key",
      displayName: "Baki",
      canonicalStatus: "known_ip_diverged",
      baseFacts: {
        biography: "A border commander from Sunagakure.",
        socialRole: ["commander", "border patrol director"],
        hardConstraints: ["Will not abandon patrol units under his command."],
      },
      behavioralCore: {
        motives: ["Hold the border line"],
        pressureResponses: ["Locks down and prioritizes tactical control"],
        taboos: ["Showing weakness to rivals"],
        attachments: ["His patrol unit"],
        selfImage: "A hardline commander keeping order in bad terrain.",
      },
      liveDynamics: {
        activeGoals: ["Negotiate safe passage corridors"],
        beliefDrift: ["Jujutsu institutions cannot be trusted blindly."],
        currentStrains: ["Pressure from curse activity near the barrier perimeter"],
        earnedChanges: [],
      },
    },
    profile: {
      species: "Human",
      gender: "Male",
      ageText: "35",
      appearance: "Sunagakure jonin commander",
      backgroundSummary: "A veteran border commander.",
      personaSummary: "Efficient, stern, suspicious of outsiders.",
    },
    socialContext: {
      factionId: null,
      factionName: "Sunagakure",
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Sunagakure (Hidden Sand Village)",
      relationshipRefs: [],
      socialStatus: ["Border authority"],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: ["Assess the border threat"],
      longTermGoals: ["Keep Sunagakure autonomous"],
      beliefs: ["The border must hold."],
      drives: ["Control"],
      frictions: ["Distrust of sorcerer politics"],
    },
    capabilities: {
      traits: ["Cautious strategist"],
      skills: [{ name: "Wind Release Mastery", tier: "Master" }],
      flaws: ["Overextends patrol units"],
      specialties: ["Wind Blade"],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: ["Winded"],
      statusFlags: ["On alert"],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Wind Blade"],
      equippedItemRefs: ["Wind Blade"],
      currencyNotes: "",
      signatureItems: ["Wind Blade"],
    },
    startConditions: {
      immediateSituation: "Responding to rising barrier incursions.",
    },
    provenance: {
      sourceKind: "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: "hybrid-jjk-naruto",
      legacyTags: ["Wind Release Master"],
    },
    grounding: {
      summary: "Grounded around Sunagakure border command and Wind Blade cursed-air tactics.",
      facts: ["Commands border patrol operations."],
      abilities: ["Wind Blade"],
      constraints: ["Won't abandon patrol units under his command."],
      signatureMoves: ["Wind Blade"],
      strongPoints: ["Battlefield control"],
      vulnerabilities: ["Pressure from curse activity near the barrier perimeter"],
      uncertaintyNotes: ["Feats are bounded to available campaign research."],
      powerProfile: {
        attack: "Wind Blade cuts through physical and cursed targets.",
        speed: "Operates at trained jonin combat tempo.",
        durability: "Durability depends on tactical spacing rather than tanking hits.",
        range: "Effective at mid-range through air-current attacks.",
        strengths: ["Battlefield control"],
        constraints: ["Won't abandon patrol units under his command."],
        vulnerabilities: ["Pressure from curse activity near the barrier perimeter"],
        uncertaintyNotes: ["Cross-series conclusions remain bounded."],
      },
      sources: [{ kind: "research", label: "Sunagakure brief", excerpt: "Border commander profile" }],
    },
    sourceBundle: {
      canonSources: [{ kind: "canon", label: "Village Report", excerpt: "Baki commands the patrol network." }],
      secondarySources: [{ kind: "card", label: "Imported card", excerpt: "Frames him as an efficient hardliner." }],
      synthesis: {
        owner: "worldforge",
        strategy: "worldforge-owned-synthesis",
        notes: ["Keep Sunagakure command logic stable."],
      },
    },
    continuity: {
      identityInertia: "anchored",
      protectedCore: ["Duty to Sunagakure"],
      mutableSurface: ["Tactics toward sorcerers"],
      changePressureNotes: ["Requires repeated evidence of institutional betrayal."],
    },
  };
}

function makeRecord(): CharacterRecord {
  const draft = makeDraft();
  return {
    ...draft,
    identity: {
      ...draft.identity,
      id: "npc-baki",
      campaignId: "campaign-1",
    },
  };
}

describe("CharacterRecordInspector", () => {
  it("renders structured grounding, power profile, continuity, and canon source sections", async () => {
    const user = userEvent.setup();
    render(<CharacterRecordInspector draft={makeDraft()} characterRecord={makeRecord()} />);

    await user.click(screen.getByText(/^advanced$/i));

    const groundingSection = screen.getByRole("heading", { name: /grounding/i }).closest("section");
    const powerSection = screen.getByRole("heading", { name: /power profile/i }).closest("section");
    const continuitySection = screen.getByRole("heading", { name: /continuity/i }).closest("section");
    const canonSourcesSection = screen.getByRole("heading", { name: /canon sources/i }).closest("section");

    expect(groundingSection).not.toBeNull();
    expect(powerSection).not.toBeNull();
    expect(continuitySection).not.toBeNull();
    expect(canonSourcesSection).not.toBeNull();

    expect(screen.getByText(/^advanced$/i)).toBeInTheDocument();
    expect(screen.getByText("Baki")).toBeInTheDocument();
    expect(
      within(groundingSection!).getByText(
        /Grounded around Sunagakure border command and Wind Blade cursed-air tactics/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(groundingSection!).getByText(/Commands border patrol operations/i),
    ).toBeInTheDocument();
    expect(
      within(powerSection!).getByText(/Wind Blade cuts through physical and cursed targets/i),
    ).toBeInTheDocument();
    expect(within(powerSection!).getByText(/Battlefield control/i)).toBeInTheDocument();
    expect(within(continuitySection!).getByText(/Anchored/i)).toBeInTheDocument();
    expect(within(continuitySection!).getByText(/Duty to Sunagakure/i)).toBeInTheDocument();
    expect(within(canonSourcesSection!).getByText(/Village Report/i)).toBeInTheDocument();
    expect(
      within(canonSourcesSection!).getByText(/Baki commands the patrol network/i),
    ).toBeInTheDocument();
  });

  it("suppresses duplicate self-image text and system role labels", async () => {
    const user = userEvent.setup();
    const draft = makeDraft();
    draft.identity.baseFacts!.socialRole = ["npc", "Teacher", "player"];
    draft.identity.behavioralCore!.selfImage = draft.profile.personaSummary;

    render(<CharacterRecordInspector draft={draft} />);

    await user.click(screen.getByText(/^advanced$/i));
    const identitySection = screen.getByRole("heading", { name: /identity core/i }).closest("section");

    expect(screen.queryByText(/self image/i)).not.toBeInTheDocument();
    expect(identitySection).not.toBeNull();
    expect(within(identitySection!).getByText(/^Teacher$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^npc$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^player$/i)).not.toBeInTheDocument();
  });
});
