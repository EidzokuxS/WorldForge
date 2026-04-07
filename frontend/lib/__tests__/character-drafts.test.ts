import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import {
  characterDraftToScaffoldNpc,
  createEmptyNpcDraft,
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
