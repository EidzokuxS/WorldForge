import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@worldforge/shared";
import { buildNpcIdentityPrompt } from "../npc-agent.js";

function makeNpcRecord(
  overrides: Partial<CharacterRecord["identity"]> = {},
): CharacterRecord {
  return {
    identity: {
      id: "npc-1",
      campaignId: "camp-1",
      role: "npc",
      tier: "key",
      displayName: "Captain Mire",
      canonicalStatus: "original",
      baseFacts: {
        biography: "A veteran signal-station commander.",
        socialRole: ["warden", "quartermaster"],
        hardConstraints: ["Will not abandon the barricade"],
      },
      behavioralCore: {
        motives: ["Protect the valley"],
        pressureResponses: ["Turns colder under pressure"],
        taboos: ["Will not run"],
        attachments: ["The station crew"],
        selfImage: "Last wall before the valley breaks.",
      },
      liveDynamics: {
        attachments: ["The station crew"],
        activeGoals: ["Hold the barricade"],
        beliefDrift: ["The station can still be saved"],
        currentStrains: ["Running out of supplies"],
        earnedChanges: [],
      },
      personality: {
        summary: "A relentless field commander who hides fear under procedure.",
        voice: "Clipped orders, battlefield shorthand, no softness unless someone is bleeding.",
        decisionStyle: "Scans, commits, and accepts fallout later.",
        worldview: "Order is mercy when the world is collapsing.",
        internalContradictions: [
          "Calls herself practical, but keeps sacrificing leverage to protect stragglers.",
        ],
        personalMythology: "If the line holds under her watch, the dead did not die for nothing.",
        sampleLines: [
          "Patch the breach, then tell me who failed to see it coming.",
        ],
      },
      ...overrides,
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "42",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "A hard-edged commander who masks fear with discipline.",
    },
    socialContext: {
      factionId: null,
      factionName: "Wardens",
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "loc-1",
      currentLocationName: "North Barricade",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: ["Hold the barricade"],
      longTermGoals: ["Restore order in the valley"],
      beliefs: ["The station can still be saved"],
      drives: ["Protect the valley"],
      frictions: ["Running out of supplies"],
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

describe("buildNpcIdentityPrompt personality output", () => {
  it("uses personality fields instead of enduring motives, pressure responses, and taboos", () => {
    const prompt = buildNpcIdentityPrompt(makeNpcRecord()).join("\n");

    expect(prompt).toContain("Personality:");
    expect(prompt).toContain("Personality summary: A relentless field commander who hides fear under procedure.");
    expect(prompt).toContain("Voice: Clipped orders, battlefield shorthand, no softness unless someone is bleeding.");
    expect(prompt).toContain("Internal contradictions: Calls herself practical, but keeps sacrificing leverage to protect stragglers.");
    expect(prompt).toContain("Sample lines: Patch the breach, then tell me who failed to see it coming.");
    expect(prompt).not.toContain("Enduring motives:");
    expect(prompt).not.toContain("Pressure responses:");
    expect(prompt).not.toContain("Taboos:");
  });

  it("keeps the self-image line even when personality is absent", () => {
    const prompt = buildNpcIdentityPrompt(
      makeNpcRecord({
        personality: undefined,
        behavioralCore: {
          motives: [],
          pressureResponses: [],
          taboos: [],
          attachments: [],
          selfImage: "Still the wall that stands.",
        },
      }),
    ).join("\n");

    expect(prompt).toContain("Self-image: Still the wall that stands.");
    expect(prompt).not.toContain("Personality summary:");
  });
});
