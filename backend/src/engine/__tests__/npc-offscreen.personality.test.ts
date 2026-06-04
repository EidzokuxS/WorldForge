import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@worldforge/shared";
import { buildOffscreenIdentitySummary } from "../npc-offscreen.js";

function makeNpcRecord(
  overrides: Partial<CharacterRecord["identity"]> = {},
): CharacterRecord {
  return {
    identity: {
      id: "npc-1",
      campaignId: "camp-1",
      role: "npc",
      tier: "key",
      displayName: "Lord Blackwood",
      canonicalStatus: "original",
      baseFacts: {
        biography: "A council noble balancing ambition against public order.",
        socialRole: ["council noble"],
        hardConstraints: ["Cannot expose his pact with the regent"],
      },
      behavioralCore: {
        motives: ["Secure lasting leverage over the succession"],
        pressureResponses: ["Becomes ceremonially polite"],
        taboos: ["Will not beg for mercy"],
        attachments: ["His daughter"],
        selfImage: "The only adult left in a room of opportunists.",
      },
      liveDynamics: {
        attachments: ["His daughter"],
        activeGoals: ["Secure the council vote"],
        beliefDrift: ["The market unrest may be useful if controlled"],
        currentStrains: ["Watching for betrayal"],
        earnedChanges: [],
      },
      personality: {
        summary: "A court operator who treats panic like a smell to hide, not a weakness to admit.",
        voice: "Formal, measured, and heavy with implication instead of volume.",
        decisionStyle: "Tests leverage indirectly, then moves before anyone has time to regroup.",
        worldview: "Stability belongs to whoever controls the room before it knows it is moving.",
        internalContradictions: [
          "Claims to defend order, but keeps feeding the chaos he thinks only he can manage.",
        ],
        personalMythology: "If he does not guide the succession, children will inherit a bonfire.",
        sampleLines: ["You mistake silence for consent. I assure you, it is arithmetic."],
      },
      ...overrides,
    },
    profile: {
      species: "Human",
      gender: "Male",
      ageText: "51",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "A calculating noble who hides panic behind manners.",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "loc-2",
      currentLocationName: "Council Hall",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: ["Secure the council vote"],
      longTermGoals: ["Take the throne"],
      beliefs: ["Power rewards patience"],
      drives: ["Ambition"],
      frictions: ["Paranoid"],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: "scaffold",
      legacyTags: [],
    },
  };
}

describe("buildOffscreenIdentitySummary personality output", () => {
  it("uses a bounded personality slice instead of motives, pressure responses, and taboos", () => {
    const summary = buildOffscreenIdentitySummary(makeNpcRecord()).join("\n");

    expect(summary).toContain("Personality summary: A court operator who treats panic like a smell to hide, not a weakness to admit.");
    expect(summary).toContain("Voice: Formal, measured, and heavy with implication instead of volume.");
    expect(summary).toContain("Internal contradictions: Claims to defend order, but keeps feeding the chaos he thinks only he can manage.");
    expect(summary).toContain("Self-image: The only adult left in a room of opportunists.");
    expect(summary).not.toContain("Enduring motives");
    expect(summary).not.toContain("Pressure responses");
    expect(summary).not.toContain("Taboos");
  });
});
