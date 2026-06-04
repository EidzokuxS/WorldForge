import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import { createCharacterRecordFromDraft } from "../../character/record-adapters.js";
import { buildRuntimeIdentityLines } from "../prompt-assembler.js";

function makeDraft(overrides: Partial<CharacterDraft["identity"]> = {}): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Mara Voss",
      canonicalStatus: "original",
      baseFacts: {
        biography: "A courier who outlived three border collapses.",
        socialRole: ["player", "courier"],
        hardConstraints: ["Never abandon the satchel"],
      },
      behavioralCore: {
        motives: ["Keep moving"],
        pressureResponses: ["Shuts down under scrutiny"],
        taboos: ["Leave debt unpaid"],
        attachments: ["legacy-bond"],
        selfImage: "A runner who survives by staying useful.",
      },
      liveDynamics: {
        attachments: ["live-bond"],
        activeGoals: ["Reach the signal tower"],
        beliefDrift: ["The city can still be warned"],
        currentStrains: ["Being hunted"],
        earnedChanges: [],
      },
      personality: {
        summary: "Tense, hyper-observant, and always half a step from bolting.",
        voice: "Clipped sentences, practical detail, no wasted softness.",
        decisionStyle: "Calculates quickly, then commits before doubt can catch up.",
        worldview: "Systems fail; people maybe don't.",
        internalContradictions: [
          "Craves distance, but keeps volunteering for dangerous errands.",
        ],
        personalMythology: "If she keeps the message moving, the collapse has not won.",
        sampleLines: [
          "Keep up or keep clear, but don't slow me down.",
          "I don't need faith. I need the next door unlocked.",
        ],
      },
      ...overrides,
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "29",
      appearance: "Storm cloak and split knuckles.",
      backgroundSummary: "A courier from the outer wards.",
      personaSummary: "Looks like she sleeps with one eye open.",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: "loc-1",
      currentLocationName: "Dockside",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: ["Reach the signal tower"],
      longTermGoals: ["Get out alive"],
      beliefs: ["The city can still be warned"],
      drives: ["Keep moving"],
      frictions: ["Being hunted"],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 4,
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
      sourceKind: "generator",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function renderIdentityLines(overrides: Partial<CharacterDraft["identity"]> = {}) {
  const record = createCharacterRecordFromDraft(makeDraft(overrides), {
    id: "player-1",
    campaignId: "camp-1",
  });
  return buildRuntimeIdentityLines(record).join("\n");
}

describe("buildRuntimeIdentityLines personality output", () => {
  it("emits a Personality block with the new interiority fields and no legacy behavioral-core labels", () => {
    const output = renderIdentityLines();

    expect(output).toContain("Personality: summary=");
    expect(output).toContain('voice="Clipped sentences, practical detail, no wasted softness."');
    expect(output).toContain('decision-style="Calculates quickly, then commits before doubt can catch up."');
    expect(output).toContain('worldview="Systems fail; people maybe don\'t."');
    expect(output).toContain('internal-contradictions=["Craves distance, but keeps volunteering for dangerous errands."]');
    expect(output).toContain('personal-mythology="If she keeps the message moving, the collapse has not won."');
    expect(output).toContain('sample-lines=["Keep up or keep clear, but don\'t slow me down.","I don\'t need faith. I need the next door unlocked."]');
    expect(output).toContain('attachments=["live-bond"]');
    expect(output).toContain('self-image="A runner who survives by staying useful."');
    expect(output).toContain('hard-constraints=["Never abandon the satchel"]');
    expect(output).not.toContain("Behavioral Core:");
    expect(output).not.toContain("motives:");
    expect(output).not.toContain("pressure:");
    expect(output).not.toContain("taboos:");
  });

  it("omits the Personality line entirely when personality is absent", () => {
    const output = renderIdentityLines({ personality: undefined });

    expect(output).not.toContain("Personality:");
  });

  it("reads attachments from liveDynamics instead of behavioralCore when both exist", () => {
    const output = renderIdentityLines({
      behavioralCore: {
        motives: ["Keep moving"],
        pressureResponses: ["Shuts down under scrutiny"],
        taboos: ["Leave debt unpaid"],
        attachments: ["legacy-bond"],
        selfImage: "A runner who survives by staying useful.",
      },
      liveDynamics: {
        attachments: ["live-only"],
        activeGoals: ["Reach the signal tower"],
        beliefDrift: ["The city can still be warned"],
        currentStrains: ["Being hunted"],
        earnedChanges: [],
      },
    });

    expect(output).toContain('attachments=["live-only"]');
    expect(output).not.toContain('attachments=["legacy-bond"]');
  });

  it("keeps legacy behavioralCore attachments visible through the bridge when liveDynamics is missing them", () => {
    const output = renderIdentityLines({
      personality: undefined,
      behavioralCore: {
        motives: [],
        pressureResponses: [],
        taboos: [],
        attachments: ["legacy-link"],
        selfImage: "Still standing.",
      },
      liveDynamics: undefined,
    });

    expect(output).toContain('attachments=["legacy-link"]');
    expect(output).toContain('self-image="Still standing."');
  });
});
