import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import {
  characterDraftToParsedCharacter,
  characterDraftToScaffoldNpc,
  createEmptyNpcDraft,
  parsedCharacterToDraft,
  scaffoldNpcToDraft,
} from "../character-drafts";

function makeNpcDraft(
  overrides?: Partial<CharacterDraft>,
): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: "key",
      displayName: "Captain Mira",
      canonicalStatus: "original",
      ...overrides?.identity,
    },
    profile: {
      species: "Human",
      gender: "Woman",
      ageText: "34",
      appearance: "Scarred officer",
      backgroundSummary: "",
      personaSummary: "Disciplined and watchful",
      ...overrides?.profile,
    },
    socialContext: {
      factionId: null,
      factionName: "Harbor Watch",
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Harbor",
      relationshipRefs: [],
      socialStatus: ["respected"],
      originMode: "resident",
      ...overrides?.socialContext,
    },
    motivations: {
      shortTermGoals: ["Catch smugglers"],
      longTermGoals: ["Secure the port"],
      beliefs: [],
      drives: ["Duty"],
      frictions: ["Corruption"],
      ...overrides?.motivations,
    },
    capabilities: {
      traits: ["alert"],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
      ...overrides?.capabilities,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
      ...overrides?.state,
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
      ...overrides?.loadout,
    },
    startConditions: {
      ...overrides?.startConditions,
    },
    provenance: {
      sourceKind: "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
      ...overrides?.provenance,
    },
  };
}

describe("characterDraftToScaffoldNpc", () => {
  it("maps key drafts to key scaffold NPCs", () => {
    const scaffoldNpc = characterDraftToScaffoldNpc(
      makeNpcDraft({
        identity: { role: "npc", tier: "key", displayName: "Captain Mira", canonicalStatus: "original" },
      }),
    );

    expect(scaffoldNpc.tier).toBe("key");
  });

  it("maps non-key npc drafts to supporting scaffold NPCs", () => {
    const supportingDraft = makeNpcDraft({
      identity: {
        role: "npc",
        tier: "persistent",
        displayName: "Quartermaster Sol",
        canonicalStatus: "original",
      },
    });

    const scaffoldNpc = characterDraftToScaffoldNpc(supportingDraft);

    expect(scaffoldNpc.tier).toBe("supporting");
  });

  it("derives compatibility persona and goals from richer identity when shallow fields are empty", () => {
    const richIdentityDraft = makeNpcDraft({
      profile: {
        species: "Human",
        gender: "Woman",
        ageText: "34",
        appearance: "Scarred officer",
        backgroundSummary: "",
        personaSummary: "",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
      identity: {
        role: "npc",
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
    });

    const scaffoldNpc = characterDraftToScaffoldNpc(richIdentityDraft);

    expect(scaffoldNpc.persona).toBe("A wall between the harbor and chaos.");
    expect(scaffoldNpc.goals.shortTerm).toEqual(["Find the vanished customs ledger"]);
    expect(scaffoldNpc.draft?.sourceBundle?.canonSources[0]?.label).toBe("Harbor Chronicle");
    expect(scaffoldNpc.draft?.continuity?.identityInertia).toBe("anchored");
  });
});

describe("scaffoldNpcToDraft", () => {
  it("preserves an explicit supporting scaffold tier and syncs draft.identity.tier", () => {
    const draft = makeNpcDraft({
      identity: {
        role: "npc",
        tier: "key",
        displayName: "Quartermaster Sol",
        canonicalStatus: "original",
      },
    });

    const result = scaffoldNpcToDraft({
      name: "Quartermaster Sol",
      persona: "Runs the docks ledgers",
      tags: ["careful"],
      goals: { shortTerm: ["Audit cargo"], longTerm: ["Protect supply lines"] },
      locationName: "Harbor",
      factionName: "Harbor Watch",
      tier: "supporting",
      draft,
    });

    expect(result.identity.tier).toBe("supporting");
    expect(result.identity.displayName).toBe("Quartermaster Sol");
  });

  it("materializes a supporting draft instead of inventing key for legacy supporting scaffold NPCs", () => {
    const result = scaffoldNpcToDraft({
      name: "Dockhand Pev",
      persona: "Knows every crate in the harbor",
      tags: ["quiet"],
      goals: { shortTerm: ["Unload the ship"], longTerm: ["Buy a boat"] },
      locationName: "Harbor",
      factionName: null,
      tier: "supporting",
    });

    expect(result.identity.tier).toBe("supporting");
    expect(result.profile.personaSummary).toBe("Knows every crate in the harbor");
  });
});

describe("createEmptyNpcDraft", () => {
  it("creates manual NPC drafts with an explicit requested tier", () => {
    const supportingDraft = createEmptyNpcDraft("Harbor", "supporting");
    const keyDraft = createEmptyNpcDraft("Harbor", "key");

    expect(supportingDraft.identity.tier).toBe("supporting");
    expect(keyDraft.identity.tier).toBe("key");
  });
});

describe("player draft round-trips", () => {
  it("preserves backend-owned source and continuity metadata across parsed-character save/load projections", () => {
    const draft: CharacterDraft = {
      identity: {
        role: "player",
        tier: "key",
        displayName: "Aria Vale",
        canonicalStatus: "imported",
        baseFacts: {
          biography: "Exiled court mage carrying the last seal of Vale.",
          socialRole: ["Exile", "Court mage"],
          hardConstraints: ["Will not surrender the seal"],
        },
        behavioralCore: {
          motives: ["Recover her house"],
          pressureResponses: ["Turns colder and more formal"],
          taboos: ["Begging old allies for mercy"],
          attachments: ["Her younger brother"],
          selfImage: "A disgraced heir refusing to bend.",
        },
        liveDynamics: {
          activeGoals: ["Reach the archive before the inquisitors"],
          beliefDrift: ["One ally inside the court may still be loyal"],
          currentStrains: ["Running on too little sleep"],
          earnedChanges: ["Began trusting local smugglers"],
        },
      },
      profile: {
        species: "Human",
        gender: "Woman",
        ageText: "29",
        appearance: "Ink-dark hair braided with silver thread",
        backgroundSummary: "",
        personaSummary: "",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: "Vale",
        currentLocationId: null,
        currentLocationName: "Old Archive",
        relationshipRefs: [],
        socialStatus: ["disgraced noble"],
        originMode: "outsider",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
      capabilities: {
        traits: ["precise"],
        skills: [{ name: "wardcraft", tier: "Master" }],
        flaws: ["guarded"],
        specialties: ["court magic"],
        wealthTier: "Comfortable",
      },
      state: {
        hp: 4,
        conditions: ["exhausted"],
        statusFlags: ["wanted"],
        activityState: "idle",
      },
      loadout: {
        inventorySeed: ["Vale signet"],
        equippedItemRefs: ["Vale signet"],
        currencyNotes: "",
        signatureItems: ["Vale signet"],
      },
      startConditions: {
        sourcePrompt: "I arrive at the archive under a false name.",
      },
      provenance: {
        sourceKind: "import",
        importMode: "outsider",
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: ["wardcraft", "noble"],
      },
      sourceBundle: {
        canonSources: [
          {
            kind: "research",
            label: "Vale Succession Notes",
            excerpt: "Aria fled with the seal.",
          },
        ],
        secondarySources: [
          {
            kind: "card",
            label: "Imported Card",
            excerpt: "Proud exile with clipped manners.",
          },
        ],
        synthesis: {
          owner: "worldforge",
          strategy: "merge",
          notes: ["Imported outsider canon."],
        },
      },
      continuity: {
        identityInertia: "anchored",
        protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
        mutableSurface: ["identity.liveDynamics"],
        changePressureNotes: ["Needs earned reconciliation before softening."],
      },
    };

    const parsedCharacter = characterDraftToParsedCharacter(draft);
    const nextDraft = parsedCharacterToDraft({
      ...parsedCharacter,
      name: "Aria Vale",
      locationName: "Archive Atrium",
      hp: 3,
    });

    expect(nextDraft.identity.baseFacts?.biography).toBe(
      "Exiled court mage carrying the last seal of Vale.",
    );
    expect(nextDraft.identity.behavioralCore?.selfImage).toBe(
      "A disgraced heir refusing to bend.",
    );
    expect(nextDraft.identity.liveDynamics?.activeGoals).toEqual([
      "Reach the archive before the inquisitors",
    ]);
    expect(nextDraft.sourceBundle?.secondarySources[0]?.label).toBe("Imported Card");
    expect(nextDraft.continuity?.protectedCore).toEqual([
      "identity.baseFacts",
      "identity.behavioralCore",
    ]);
    expect(nextDraft.socialContext.currentLocationName).toBe("Archive Atrium");
    expect(nextDraft.state.hp).toBe(3);
  });
});
