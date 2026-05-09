// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CharacterDraft, CharacterRecord, PowerStats } from "@worldforge/shared";
import { CharacterRecordInspector } from "../character-record-inspector";

const MOCK_POWER_STATS: PowerStats = {
  attackPotency: { tier: "Wall", rank: 5 },
  speed: { tier: "Superhuman", rank: 3 },
  durability: { tier: "Wall", rank: 4 },
  intelligence: { tier: "Gifted", rank: 6 },
  hax: [
    {
      name: "Wind Cutter",
      type: "Kinetic Projection",
      bypassTier: "Wall",
      limitations: ["Requires breath control"],
    },
  ],
  vulnerabilities: [
    { description: "Pressure from monster incursions near the warded perimeter", severity: "major" },
  ],
};

const IMPORT_MODE_BADGE = "v2-card" as unknown as CharacterDraft["provenance"]["importMode"];

function makeFullDraft(): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: "key",
      displayName: "Commander Kael",
      canonicalStatus: "original",
      baseFacts: {
        biography: "Kael commanded the Dunespire border watch for twelve turns of the seal.",
        socialRole: ["commander", "border patrol director"],
        hardConstraints: ["Will not abandon patrol units under his command."],
      },
      behavioralCore: {
        selfImage: "A hardline commander keeping order in bad terrain.",
        motives: ["Hold the border line"],
        pressureResponses: ["Locks down and prioritizes tactical control"],
        taboos: ["Showing weakness to rivals"],
        attachments: ["His patrol unit"],
      },
      personality: {
        summary: "A border commander who treats every dawn watch as a siege line.",
        voice: "Clipped patrol jargon, formal reports, rare admissions of fear.",
        decisionStyle: "Acts first, stabilizes the aftermath second.",
        worldview: "Safe borders are paid for in vigilance, not hope.",
        internalContradictions: [
          "Talks like a strict tactician, but routinely breaks protocol to save exhausted scouts.",
        ],
        personalMythology: "If I hold the wall, the desert does not enter.",
        sampleLines: ["Hold the eastern ward.", "No gaps in the perimeter."],
      },
      liveDynamics: {
        activeGoals: ["Negotiate safe passage corridors"],
        beliefDrift: ["Sorcerer councils cannot be trusted blindly."],
        currentStrains: ["Pressure from monster incursions near the warded perimeter"],
        earnedChanges: ["Softened stance toward outside scholars after the Wardstone incident."],
      },
    },
    profile: {
      species: "Human",
      gender: "Male",
      ageText: "35",
      appearance: "Dunespire marshal in patrol gear",
      backgroundSummary: "A veteran border commander from Dunespire Hold.",
      personaSummary: "Efficient, stern, suspicious of outsiders.",
    },
    socialContext: {
      factionId: null,
      factionName: "Dunespire Hold",
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Dunespire Hold (Warded City)",
      relationshipRefs: [
        {
          entityId: "npc-councillor-vey",
          entityName: "Rival: Councillor Vey of Wardstone Plaza",
          type: "",
          reason: "",
        },
      ],
      socialStatus: ["Border authority", "Wind Cutting master"],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: ["Assess the border threat"],
      longTermGoals: ["Keep Dunespire autonomous"],
      beliefs: ["The border must hold."],
      drives: ["Control"],
      frictions: ["Distrust of sorcerer politics"],
    },
    capabilities: {
      traits: ["Cautious strategist"],
      skills: [{ name: "Wind Cutting Mastery", tier: "Master" }],
      specialties: ["Wind Blade"],
      flaws: ["Overextends patrol units"],
      wealthTier: "Comfortable",
    },
    state: {
      hp: 5,
      conditions: ["Winded"],
      statusFlags: ["On alert"],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Wind Blade", "patrol emblem"],
      equippedItemRefs: ["Wind Blade"],
      signatureItems: ["Wind Blade"],
      currencyNotes: "12 marks of the Dunespire treasury",
    },
    startConditions: {
      sourcePrompt: "Begin at the warded perimeter during the incursion alert.",
      arrivalMode: "already-present",
      startLocationId: "loc-dunespire-perimeter",
      immediateSituation: "Responding to rising warded-barrier incursions.",
      entryPressure: ["incursion alert", "patrol roll call"],
      companions: ["Patrol Corporal Nim"],
      startingVisibility: "visible",
      resolvedNarrative: "Kael stands at the Wardstone Plaza, patrol roster in hand.",
    },
    provenance: {
      sourceKind: "worldgen",
      importMode: IMPORT_MODE_BADGE,
      templateId: "tpl-border-commander",
      archetypePrompt: "stoic border commander, wind-cutting school",
      worldgenOrigin: "original-storm-marches",
      legacyTags: ["Wind Cutting Master", "Border Authority"],
    },
    powerStats: MOCK_POWER_STATS,
  };
}

function makeInvariantOnlyDraft(): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: "key",
      displayName: "Commander Kael",
      canonicalStatus: "original",
      baseFacts: {
        biography: "",
        socialRole: [],
        hardConstraints: [],
      },
      behavioralCore: {
        selfImage: "",
        motives: [],
        pressureResponses: [],
        taboos: [],
        attachments: [],
      },
      liveDynamics: {
        activeGoals: [],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
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
      factionName: "",
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "",
      relationshipRefs: [],
      socialStatus: [],
      originMode: null,
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
      specialties: [],
      flaws: [],
      wealthTier: null,
    },
    state: {
      hp: 3,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      signatureItems: [],
      currencyNotes: "",
    },
    startConditions: {
      sourcePrompt: null,
      arrivalMode: null,
      startLocationId: null,
      immediateSituation: null,
      entryPressure: [],
      companions: [],
      startingVisibility: null,
      resolvedNarrative: null,
    },
    provenance: {
      sourceKind: "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
    powerStats: undefined,
  };
}

function makeRecord(draft: CharacterDraft): CharacterRecord {
  return {
    ...draft,
    identity: {
      ...draft.identity,
      id: "npc-kael",
      campaignId: "campaign-1",
    },
  };
}

async function openAdvanced(draft: CharacterDraft = makeFullDraft()) {
  const user = userEvent.setup();
  render(<CharacterRecordInspector draft={draft} characterRecord={makeRecord(draft)} />);
  await user.click(screen.getByText(/^advanced$/i));
}

function getSection(name: RegExp): HTMLElement {
  const section = screen.getByRole("heading", { level: 4, name }).closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function queryTextInRenderedSections(text: RegExp): HTMLElement | null {
  const sections = screen
    .queryAllByRole("heading", { level: 4 })
    .map((heading) => heading.closest("section"))
    .filter((section): section is HTMLElement => Boolean(section));

  for (const section of sections) {
    const match = within(section).queryByText(text);
    if (match) {
      return match as HTMLElement;
    }
  }

  return null;
}

describe("CharacterRecordInspector", () => {
  it("renders the 9-section advanced contract in order after provenance removal", async () => {
    await openAdvanced();

    const sectionNames = [
      ...screen
        .getAllByRole("heading", { level: 4 })
        .map((heading) => heading.textContent?.trim()),
      screen.getByText(/^raw json$/i).textContent?.trim(),
    ];
    expect(sectionNames).toEqual([
      "Overview",
      "Identity Core",
      "Profile",
      "Live Dynamics",
      "Capabilities",
      "Runtime & State",
      "Loadout",
      "Starting Conditions",
      "Raw JSON",
    ]);
  });

  it("never renders basic-card duplicates in Advanced", async () => {
    await openAdvanced();

    expect(screen.queryByText("Display name")).not.toBeInTheDocument();
    expect(screen.queryByText("Current location")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Faction$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Persona$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Power Stats$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Active goals$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Long-term goals$/i)).not.toBeInTheDocument();
    expect(queryTextInRenderedSections(/Efficient, stern, suspicious of outsiders/i)).toBeNull();
    expect(queryTextInRenderedSections(/Negotiate safe passage corridors/i)).toBeNull();
    expect(queryTextInRenderedSections(/Assess the border threat/i)).toBeNull();
    expect(queryTextInRenderedSections(/Keep Dunespire autonomous/i)).toBeNull();
  });

  it("renders biography in Overview section", async () => {
    await openAdvanced();

    const overview = getSection(/^overview$/i);
    expect(within(overview).getByText(/Kael commanded the Dunespire/i)).toBeInTheDocument();
  });

  it("Overview badges contain provenance.importMode text and NOT socialContext.originMode text", async () => {
    await openAdvanced();

    const overview = getSection(/^overview$/i);
    expect(within(overview).getByText(/v2-card/i)).toBeInTheDocument();
    expect(within(overview).queryByText(/^resident$/i)).not.toBeInTheDocument();
  });

  it("renders Profile section with species / gender / ageText / appearance / backgroundSummary", async () => {
    await openAdvanced();

    const profile = getSection(/^profile$/i);
    expect(within(profile).getByText(/Human/i)).toBeInTheDocument();
    expect(within(profile).getByText(/Male/i)).toBeInTheDocument();
    expect(within(profile).getByText(/35/i)).toBeInTheDocument();
    expect(within(profile).getByText(/Dunespire marshal in patrol gear/i)).toBeInTheDocument();
    expect(within(profile).getByText(/A veteran border commander from Dunespire Hold/i)).toBeInTheDocument();
  });

  it("renders Identity Core socialStatus and relationshipRefs when populated", async () => {
    await openAdvanced();

    const identityCore = getSection(/^identity core$/i);
    expect(within(identityCore).getByText(/A hardline commander keeping order in bad terrain/i)).toBeInTheDocument();
    expect(within(identityCore).getByText(/Social status/i)).toBeInTheDocument();
    expect(within(identityCore).getByText(/Border authority/i)).toBeInTheDocument();
    expect(within(identityCore).getByText(/Wind Cutting master/i)).toBeInTheDocument();
    expect(within(identityCore).getByText(/Relationships/i)).toBeInTheDocument();
    expect(within(identityCore).getByText(/Rival: Councillor Vey/i)).toBeInTheDocument();
  });

  it("removes deprecated identity, capability, provenance, and personality rows from Advanced", async () => {
    await openAdvanced();

    expect(queryTextInRenderedSections(/^Motives$/i)).toBeNull();
    expect(queryTextInRenderedSections(/^Pressure responses$/i)).toBeNull();
    expect(queryTextInRenderedSections(/^Taboos$/i)).toBeNull();
    expect(queryTextInRenderedSections(/^Attachments$/i)).toBeNull();
    expect(queryTextInRenderedSections(/^Traits$/i)).toBeNull();
    expect(queryTextInRenderedSections(/^Flaws$/i)).toBeNull();
    expect(queryTextInRenderedSections(/^Legacy tags$/i)).toBeNull();
    expect(screen.queryByText(/^Provenance$/i)).not.toBeInTheDocument();
    expect(
      queryTextInRenderedSections(
        /A border commander who treats every dawn watch as a siege line/i,
      ),
    ).toBeNull();
    expect(
      queryTextInRenderedSections(/Clipped patrol jargon, formal reports/i),
    ).toBeNull();
    expect(
      queryTextInRenderedSections(/If I hold the wall, the desert does not enter/i),
    ).toBeNull();
    expect(queryTextInRenderedSections(/Hold the eastern ward\./i)).toBeNull();
  });

  it("renders Live Dynamics with beliefDrift / currentStrains / earnedChanges AND beliefs / drives / frictions, no goal rows", async () => {
    await openAdvanced();

    const liveDynamics = getSection(/^live dynamics$/i);
    expect(
      within(liveDynamics).getByText(/Sorcerer councils cannot be trusted blindly/i),
    ).toBeInTheDocument();
    expect(
      within(liveDynamics).getByText(/Pressure from monster incursions near the warded perimeter/i),
    ).toBeInTheDocument();
    expect(
      within(liveDynamics).getByText(/Softened stance toward outside scholars after the Wardstone incident/i),
    ).toBeInTheDocument();
    expect(within(liveDynamics).getByText(/The border must hold/i)).toBeInTheDocument();
    expect(within(liveDynamics).getByText(/^Control$/i)).toBeInTheDocument();
    expect(within(liveDynamics).getByText(/Distrust of sorcerer politics/i)).toBeInTheDocument();
    expect(within(liveDynamics).getByText(/^Beliefs$/i)).toBeInTheDocument();
    expect(within(liveDynamics).getByText(/^Drives$/i)).toBeInTheDocument();
    expect(within(liveDynamics).getByText(/^Frictions$/i)).toBeInTheDocument();
    expect(within(liveDynamics).queryByText(/Active goals/i)).not.toBeInTheDocument();
    expect(within(liveDynamics).queryByText(/Long-term goals/i)).not.toBeInTheDocument();
  });

  it("renders Loadout section with currencyNotes", async () => {
    await openAdvanced();

    const loadout = getSection(/^loadout$/i);
    expect(within(loadout).getAllByText(/Wind Blade/i).length).toBeGreaterThan(0);
    expect(within(loadout).getByText(/patrol emblem/i)).toBeInTheDocument();
    expect(within(loadout).getByText(/12 marks of the Dunespire treasury/i)).toBeInTheDocument();
  });

  it("renders Starting Conditions section with all sub-fields", async () => {
    await openAdvanced();

    const startingConditions = getSection(/^starting conditions$/i);
    expect(
      within(startingConditions).getByText(/Begin at the warded perimeter during the incursion alert/i),
    ).toBeInTheDocument();
    expect(within(startingConditions).getByText(/already-present/i)).toBeInTheDocument();
    expect(within(startingConditions).getByText(/loc-dunespire-perimeter/i)).toBeInTheDocument();
    expect(
      within(startingConditions).getByText(/Responding to rising warded-barrier incursions/i),
    ).toBeInTheDocument();
    expect(within(startingConditions).getByText(/^incursion alert$/i)).toBeInTheDocument();
    expect(within(startingConditions).getByText(/Patrol Corporal Nim/i)).toBeInTheDocument();
    expect(within(startingConditions).getByText(/visible/i)).toBeInTheDocument();
    expect(
      within(startingConditions).getByText(/Kael stands at the Wardstone Plaza, patrol roster in hand/i),
    ).toBeInTheDocument();
  });

  it("suppresses a section whose only non-empty fields are invariant (invariant-only draft → fallback renders)", async () => {
    await openAdvanced(makeInvariantOnlyDraft());

    expect(screen.getByText(/^No additional data$/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^overview$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^identity core$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^profile$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^live dynamics$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^capabilities$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^runtime & state$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^loadout$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^starting conditions$/i })).not.toBeInTheDocument();
  });

  it("renders Raw JSON tail alongside fallback for invariant-only draft", async () => {
    await openAdvanced(makeInvariantOnlyDraft());

    expect(screen.getByText(/^No additional data$/i)).toBeInTheDocument();
    expect(screen.getByText(/^raw json$/i)).toBeInTheDocument();
  });

  it("suppresses Runtime & State when only invariant fields are populated but other sections render", async () => {
    const baseDraft = makeInvariantOnlyDraft();
    const draft: CharacterDraft = {
      ...baseDraft,
      identity: {
        ...baseDraft.identity,
        baseFacts: {
          ...baseDraft.identity.baseFacts,
          biography:
            "Commander Kael walked the ramparts of Dunespire Hold at dawn, scanning for approaching Wind Cutting raiders.",
        },
      },
    };

    await openAdvanced(draft);

    expect(screen.queryByText(/overview/i)).not.toBeNull();
    expect(screen.queryByText(/runtime & state/i)).toBeNull();
    expect(screen.queryByText(/no additional data/i)).toBeNull();
    expect(
      within(getSection(/^overview$/i)).queryByText(/Commander Kael walked the ramparts/i),
    ).not.toBeNull();
  });

  it("uses only original-world fixture names (no IP franchise terms)", () => {
    const fullDraftJson = JSON.stringify(makeFullDraft());
    const invariantDraftJson = JSON.stringify(makeInvariantOnlyDraft());
    const forbiddenTerms = new RegExp(
      [
        "na" + "ruto",
        "sa" + "suke",
        "uc" + "hiha",
        "sharin" + "gan",
        "kono" + "ha",
        "hoka" + "ge",
        "akat" + "suki",
        "mada" + "ra",
        "ita" + "chi",
        "kaka" + "shi",
        "go" + "jo",
        "ge" + "to",
        "cursed " + "energy",
        "juj" + "utsu",
        "dragon " + "ball",
        "sa" + "iyan",
        "one " + "piece",
        "lu" + "ffy",
        "ava" + "tar",
        "air" + "bender",
        "wit" + "cher",
        "ger" + "alt",
        "star " + "wars",
        "je" + "di",
        "si" + "th",
        "harry " + "potter",
        "hog" + "warts",
      ].join("|"),
      "i",
    );

    expect(fullDraftJson).not.toMatch(forbiddenTerms);
    expect(invariantDraftJson).not.toMatch(forbiddenTerms);
  });
});
