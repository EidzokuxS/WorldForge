import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";

const mockGenerateObject = vi.fn();
const mockWebSearch = vi.fn();

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../lib/web-search.js", () => ({
  webSearch: (...args: unknown[]) => mockWebSearch(...args),
}));

import { enrichKnownIpWorldgenNpcDraft } from "../known-ip-worldgen-research.js";

const fakeRole = {
  provider: {
    id: "provider-1",
    name: "GLM",
    baseUrl: "https://example.com",
    apiKey: "secret",
    model: "glm-test",
  },
  temperature: 0.9,
  maxTokens: 32000,
};

function makeDraft(): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: "key",
      displayName: "Gojo Satoru",
      canonicalStatus: "known_ip_diverged",
      baseFacts: {
        biography: "",
        socialRole: ["Teacher", "Jujutsu Sorcerer"],
        hardConstraints: [],
      },
      behavioralCore: {
        motives: [],
        pressureResponses: [],
        taboos: [],
        attachments: [],
        selfImage: "",
      },
      liveDynamics: {
        activeGoals: ["Protect his students"],
        beliefDrift: [],
        currentStrains: [],
        earnedChanges: [],
      },
    },
    profile: {
      species: "Human",
      gender: "Male",
      ageText: "28",
      appearance: "Tall sorcerer with white hair and a blindfold.",
      backgroundSummary: "",
      personaSummary: "Cocky, casual, and openly contemptuous of conservative elders.",
    },
    socialContext: {
      factionId: null,
      factionName: "Jujutsu Sorcerers",
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Tokyo Jujutsu High",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: ["Protect his students"],
      longTermGoals: ["Rebuild jujutsu society"],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: ["Six Eyes User", "Limitless Technique"],
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
      worldgenOrigin: "teacher and strongest sorcerer",
      legacyTags: ["Special Grade Sorcerer"],
    },
  };
}

describe("enrichKnownIpWorldgenNpcDraft", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    mockWebSearch.mockReset();
  });

  it("fails closed when research is disabled", async () => {
    await expect(
      enrichKnownIpWorldgenNpcDraft({
        draft: makeDraft(),
        franchise: "Jujutsu Kaisen",
        role: fakeRole,
        research: { enabled: false, maxSearchSteps: 5, searchProvider: "duckduckgo" },
        premise: "Jujutsu Kaisen with a Naruto power overlay.",
      }),
    ).rejects.toThrow(/requires research to be enabled/i);
  });

  it("attaches canon-backed grounding, continuity, and self-image for known-IP key NPCs", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer, teacher at Tokyo Jujutsu High, wielder of Limitless and Six Eyes.",
        url: "https://example.com/gojo",
      },
      {
        title: "Limitless",
        description: "Inherited technique enabling Infinity, Blue, Red, and Hollow Purple.",
        url: "https://example.com/limitless",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        summary:
          "Gojo Satoru is the strongest active jujutsu sorcerer, a teacher at Tokyo Jujutsu High, and the most destabilizing opponent of conservative jujutsu leadership.",
        selfImage:
          "He sees himself as the one person strong enough to protect the next generation and drag jujutsu society forward by force if necessary.",
        socialRoles: ["Teacher", "Special Grade Sorcerer", "Gojo Clan Heir"],
        facts: [
          "Gojo teaches at Tokyo Jujutsu High.",
          "He inherited both the Six Eyes and the Limitless technique.",
        ],
        abilities: ["Six Eyes", "Limitless", "Infinity", "Domain Expansion: Unlimited Void"],
        constraints: ["Cannot reform the institution overnight through force alone."],
        signatureMoves: ["Hollow Purple", "Unlimited Void"],
        strongPoints: ["Overwhelming spatial control", "Reaction speed through Six Eyes"],
        vulnerabilities: ["Political isolation", "Students become leverage against him"],
        protectedCore: ["Protects promising students", "Refuses conservative jujutsu authority"],
        mutableSurface: ["Current alliances", "Tactical restraint in public"],
        changePressureNotes: ["Meaningful losses can make him more ruthless, not obedient."],
        powerProfile: {
          attack: "Possesses city-block to district-scale kill pressure through Hollow Purple and Blue/Red combinations.",
          speed: "Top-tier combat reactions and initiative due to Six Eyes and technique mastery.",
          durability: "Defensively anchored in Infinity rather than raw body tanking.",
          range: "Controls close, mid, and long lines through spatial manipulation and domain pressure.",
          strengths: ["Spatial denial", "Near-unmatched technique efficiency"],
          constraints: ["Reliant on technique access and tactical awareness"],
          vulnerabilities: ["Sealing, leverage through students, and institutional counterplay"],
          uncertaintyNotes: ["Cross-franchise scaling remains bounded to attested canon feats."],
        },
      },
    });

    const draft = await enrichKnownIpWorldgenNpcDraft({
      draft: makeDraft(),
      franchise: "Jujutsu Kaisen",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 5, searchProvider: "duckduckgo" },
      premise: "Jujutsu Kaisen with a Naruto power overlay.",
      premiseDivergence: {
        mode: "diverged",
        protagonistRole: {
          kind: "custom",
          interpretation: "replacement",
          canonicalCharacterName: null,
          roleSummary: "A custom outsider changed the pressure around Tokyo Jujutsu High.",
        },
        preservedCanonFacts: ["Gojo remains a teacher at Tokyo Jujutsu High."],
        changedCanonFacts: ["Chakra users now exist inside the modern Japanese conflict map."],
        currentStateDirectives: ["Preserve canon conservatively unless the divergence explicitly changes it."],
        ambiguityNotes: [],
      },
    });

    expect(draft.identity.behavioralCore?.selfImage).toContain("protect the next generation");
    expect(draft.identity.baseFacts?.socialRole).toEqual(
      expect.arrayContaining(["Teacher", "Special Grade Sorcerer", "Gojo Clan Heir"]),
    );
    expect(draft.grounding?.abilities).toEqual(
      expect.arrayContaining(["Six Eyes", "Limitless", "Infinity"]),
    );
    expect(draft.grounding?.powerProfile?.attack).toContain("Hollow Purple");
    expect(draft.sourceBundle?.canonSources[0]?.label).toContain("Satoru Gojo");
    expect(draft.continuity?.protectedCore).toEqual(
      expect.arrayContaining(["Protects promising students"]),
    );
  });

  it("repairs malformed model output instead of failing the whole known-IP enrichment pass", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer, teacher at Tokyo Jujutsu High, wielder of Limitless and Six Eyes.",
        url: "https://example.com/gojo",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          characterName: "Gojo Satoru",
          franchise: "Naruto and Jujutsu Kaisen",
          canonFacts: [
            "Special Grade sorcerer and instructor at Tokyo Prefectural Jujutsu High School",
            "Born into the Gojo Clan, inheriting both Six Eyes and Limitless cursed technique",
          ],
          abilities: {
            traits: ["Six Eyes", "Limitless Technique"],
            signature: ["Hollow Purple", "Unlimited Void"],
          },
          socialRoles: ["Teacher", "Special Grade Sorcerer"],
          powerProfile: {
            strengths: ["Spatial control", "Technique efficiency"],
          },
        },
      })
      .mockResolvedValueOnce({
        object: {
          identity: {
            name: "Gojo Satoru",
            selfImage:
              "He sees himself as the one person strong enough to protect the next generation and drag jujutsu society forward by force if necessary.",
            socialRoles: ["Teacher", "Special Grade Sorcerer", "Gojo Clan Heir"],
          },
          summary:
            "Gojo Satoru is the strongest active jujutsu sorcerer, a teacher at Tokyo Jujutsu High, and the most destabilizing opponent of conservative jujutsu leadership.",
          facts: [
            "Gojo teaches at Tokyo Jujutsu High.",
            "He inherited both the Six Eyes and the Limitless technique.",
          ],
          abilities: {
            core: ["Six Eyes", "Limitless", "Infinity"],
            signature: ["Domain Expansion: Unlimited Void"],
          },
          constraints: ["Cannot reform the institution overnight through force alone."],
          signatureMoves: ["Hollow Purple", "Unlimited Void"],
          strongPoints: ["Overwhelming spatial control", "Reaction speed through Six Eyes"],
          vulnerabilities: ["Political isolation", "Students become leverage against him"],
          protectedCore: ["Protects promising students", "Refuses conservative jujutsu authority"],
          mutableSurface: ["Current alliances", "Tactical restraint in public"],
          changePressureNotes: ["Meaningful losses can make him more ruthless, not obedient."],
          powerProfile: {
            attack: "Possesses city-block to district-scale kill pressure through Hollow Purple and Blue/Red combinations.",
            speed: "Top-tier combat reactions and initiative due to Six Eyes and technique mastery.",
            durability: "Defensively anchored in Infinity rather than raw body tanking.",
            range: "Controls close, mid, and long lines through spatial manipulation and domain pressure.",
            strengths: ["Spatial denial", "Near-unmatched technique efficiency"],
            constraints: ["Reliant on technique access and tactical awareness"],
            vulnerabilities: ["Sealing, leverage through students, and institutional counterplay"],
            uncertaintyNotes: ["Cross-franchise scaling remains bounded to attested canon feats."],
          },
        },
      });

    const draft = await enrichKnownIpWorldgenNpcDraft({
      draft: makeDraft(),
      franchise: "Jujutsu Kaisen",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 5, searchProvider: "duckduckgo" },
      premise: "Jujutsu Kaisen with a Naruto power overlay.",
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(draft.grounding?.powerProfile?.attack).toContain("Hollow Purple");
    expect(draft.identity.behavioralCore?.selfImage).toContain("protect the next generation");
    expect(draft.grounding?.abilities).toEqual(
      expect.arrayContaining(["Six Eyes", "Limitless", "Infinity", "Domain Expansion: Unlimited Void"]),
    );
    expect(draft.identity.baseFacts?.socialRole).toEqual(
      expect.arrayContaining(["Teacher", "Special Grade Sorcerer", "Gojo Clan Heir"]),
    );
    expect(draft.continuity?.protectedCore).toEqual(
      expect.arrayContaining(["Protects promising students"]),
    );
  });

  it("caps overlong arrays before schema parse instead of crashing on max bounds", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer, teacher at Tokyo Jujutsu High, wielder of Limitless and Six Eyes.",
        url: "https://example.com/gojo",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        summary:
          "Gojo Satoru is the strongest active jujutsu sorcerer alive and a teacher at Tokyo Jujutsu High.",
        selfImage:
          "He sees himself as the pillar keeping the next generation alive long enough to surpass him.",
        socialRoles: [
          "Teacher",
          "Special Grade Sorcerer",
          "Gojo Clan Heir",
          "Mentor",
          "Political Disruptor",
          "Extra Role That Should Be Trimmed",
        ],
        facts: [
          "Fact 1",
          "Fact 2",
          "Fact 3",
          "Fact 4",
          "Fact 5",
          "Fact 6",
          "Fact 7",
        ],
        abilities: [
          "Ability 1",
          "Ability 2",
          "Ability 3",
          "Ability 4",
          "Ability 5",
          "Ability 6",
          "Ability 7",
          "Ability 8",
          "Ability 9",
        ],
        constraints: ["Constraint 1", "Constraint 2", "Constraint 3", "Constraint 4", "Constraint 5", "Constraint 6"],
        signatureMoves: ["Move 1", "Move 2", "Move 3", "Move 4", "Move 5", "Move 6"],
        strongPoints: ["Strong 1", "Strong 2", "Strong 3", "Strong 4", "Strong 5", "Strong 6", "Strong 7"],
        vulnerabilities: ["Weak 1", "Weak 2", "Weak 3", "Weak 4", "Weak 5", "Weak 6"],
        protectedCore: ["Core 1", "Core 2", "Core 3", "Core 4", "Core 5", "Core 6", "Core 7"],
        mutableSurface: ["Surface 1", "Surface 2", "Surface 3", "Surface 4", "Surface 5", "Surface 6"],
        changePressureNotes: ["Note 1", "Note 2", "Note 3", "Note 4", "Note 5", "Note 6"],
        powerProfile: {
          attack: "Extreme offensive output.",
          speed: "Top-tier reactions.",
          durability: "Infinity-based defense.",
          range: "Close to long range.",
          strengths: ["Power strength 1", "Power strength 2"],
          constraints: ["Power constraint 1", "Power constraint 2"],
          vulnerabilities: ["Power weakness 1", "Power weakness 2"],
          uncertaintyNotes: ["Power uncertainty 1", "Power uncertainty 2", "Power uncertainty 3", "Power uncertainty 4", "Power uncertainty 5", "Power uncertainty 6"],
        },
      },
    });

    const draft = await enrichKnownIpWorldgenNpcDraft({
      draft: makeDraft(),
      franchise: "Jujutsu Kaisen",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 5, searchProvider: "duckduckgo" },
      premise: "Jujutsu Kaisen with a Naruto power overlay.",
    });

    expect(draft.grounding?.facts).toHaveLength(6);
    expect(draft.grounding?.abilities).toHaveLength(8);
    expect(draft.identity.baseFacts?.socialRole).toHaveLength(5);
    expect(draft.grounding?.signatureMoves).toHaveLength(5);
    expect(draft.grounding?.strongPoints).toHaveLength(6);
    expect(draft.grounding?.vulnerabilities).toHaveLength(5);
    expect(draft.continuity?.protectedCore).toHaveLength(6);
    expect(draft.continuity?.mutableSurface).toHaveLength(5);
    expect(draft.continuity?.changePressureNotes).toHaveLength(5);
  });

  it("retries repair when the first repaired payload still misses required minimum counts", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer, teacher at Tokyo Jujutsu High, wielder of Limitless and Six Eyes.",
        url: "https://example.com/gojo",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          characterName: "Gojo Satoru",
          canonFacts: [
            "Special Grade sorcerer and instructor at Tokyo Prefectural Jujutsu High School",
            "Inherited both Six Eyes and Limitless.",
          ],
          abilities: {
            traits: ["Six Eyes"],
          },
        },
      })
      .mockResolvedValueOnce({
        object: {
          summary: "Gojo Satoru is the strongest active jujutsu sorcerer alive.",
          identity: {
            selfImage: "He sees himself as the pillar that keeps the next generation alive.",
            socialRoles: ["Teacher"],
          },
          facts: [
            "Gojo teaches at Tokyo Jujutsu High.",
            "He inherited both the Six Eyes and the Limitless technique.",
          ],
          abilities: {
            traits: ["Six Eyes"],
          },
          protectedCore: ["Protects promising students", "Rejects conservative authority"],
          powerProfile: {
            attack: "High-output offensive spatial techniques.",
            speed: "Top-tier combat reactions.",
            durability: "Infinity-based defense.",
            range: "Close to long-range pressure.",
          },
        },
      })
      .mockResolvedValueOnce({
        object: {
          summary: "Gojo Satoru is the strongest active jujutsu sorcerer alive.",
          identity: {
            selfImage: "He sees himself as the pillar that keeps the next generation alive.",
            socialRoles: ["Teacher", "Special Grade Sorcerer"],
          },
          facts: [
            "Gojo teaches at Tokyo Jujutsu High.",
            "He inherited both the Six Eyes and the Limitless technique.",
          ],
          abilities: {
            traits: ["Six Eyes", "Limitless"],
            signature: ["Infinity"],
          },
          protectedCore: ["Protects promising students", "Rejects conservative authority"],
          powerProfile: {
            attack: "High-output offensive spatial techniques.",
            speed: "Top-tier combat reactions.",
            durability: "Infinity-based defense.",
            range: "Close to long-range pressure.",
          },
        },
      });

    const draft = await enrichKnownIpWorldgenNpcDraft({
      draft: makeDraft(),
      franchise: "Jujutsu Kaisen",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 5, searchProvider: "duckduckgo" },
      premise: "Jujutsu Kaisen with a Naruto power overlay.",
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
    expect(draft.grounding?.abilities).toEqual(
      expect.arrayContaining(["Six Eyes", "Limitless", "Infinity"]),
    );
    expect(draft.identity.baseFacts?.socialRole).toEqual(
      expect.arrayContaining(["Teacher", "Special Grade Sorcerer"]),
    );
  });
});
