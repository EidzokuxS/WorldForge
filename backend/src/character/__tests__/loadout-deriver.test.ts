import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import { deriveCanonicalLoadout } from "../loadout-deriver.js";

function makeDraft(
  overrides: Partial<CharacterDraft> = {},
): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Aria Vale",
      canonicalStatus: "original",
      ...(overrides.identity ?? {}),
    },
    profile: {
      species: "Human",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "",
      ...(overrides.profile ?? {}),
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Moonwell",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "outsider",
      ...(overrides.socialContext ?? {}),
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
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
      wealthTier: "Poor",
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
      inventorySeed: ["Travel Cloak"],
      equippedItemRefs: ["Travel Cloak"],
      currencyNotes: "",
      signatureItems: ["Weathered Compass"],
      ...(overrides.loadout ?? {}),
    },
    startConditions: {
      arrivalMode: "on-foot",
      immediateSituation: "Arrived from the pass before dawn.",
      ...(overrides.startConditions ?? {}),
    },
    provenance: {
      sourceKind: "player-input",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
      ...(overrides.provenance ?? {}),
    },
  };
}

describe("deriveCanonicalLoadout", () => {
  it("returns a deterministic normalized loadout plus audit metadata", () => {
    const draft = makeDraft();

    const first = deriveCanonicalLoadout(draft);
    const second = deriveCanonicalLoadout(draft);

    expect(first).toEqual(second);
    expect(first.loadout.equippedItemRefs).toContain("Travel Cloak");
    expect(first.loadout.signatureItems).toContain("Weathered Compass");
    expect(first.audit.length).toBeGreaterThan(0);
    expect(first.items.length).toBeGreaterThan(0);
  });

  it("handles partial start-state inputs without dropping a baseline starting kit", () => {
    const draft = makeDraft({
      startConditions: {},
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
    });

    const result = deriveCanonicalLoadout(draft);

    expect(result.loadout.equippedItemRefs.length).toBeGreaterThan(0);
    expect(result.items.some((item: { reason: string }) => item.reason.includes("baseline"))).toBe(
      true,
    );
    expect(result.audit).toContain("baseline-travel-kit");
  });

  it("stays pure and does not mutate the original draft", () => {
    const draft = makeDraft();
    const before = JSON.parse(JSON.stringify(draft)) as CharacterDraft;

    const result = deriveCanonicalLoadout(draft);

    expect(draft).toEqual(before);
    expect(result.loadout).not.toBe(draft.loadout);
  });

  it("keeps companion and opening-pressure semantics out of inventory authority", () => {
    const draft = makeDraft({
      startConditions: {
        arrivalMode: "on-foot",
        immediateSituation: "A tail is closing in near the bridge.",
        entryPressure: ["under watch", "clock running out"],
        companions: ["Mira", "Old Hound"],
        startingVisibility: "noticed",
      },
    });

    const result = deriveCanonicalLoadout(draft);
    const itemNames = result.items.map((item) => item.name);

    expect(itemNames).toContain("Travel Cloak");
    expect(itemNames).toContain("Travel Papers");
    expect(itemNames).toContain("Waterskin");
    expect(itemNames).not.toContain("Mira");
    expect(itemNames).not.toContain("Old Hound");
    expect(itemNames).not.toContain("under watch");
    expect(itemNames).not.toContain("clock running out");
  });
});
