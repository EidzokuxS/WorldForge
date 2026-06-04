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

import {
  enrichKnownIpWorldgenNpcDraft,
  normalizeLlmPowerStats,
} from "../known-ip-worldgen-research.js";
import { buildPowerStatsPromptContract } from "../prompt-contract.js";

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

  it("emits an exact power-stat contract with valid, minimal, and invalid examples", () => {
    const contract = buildPowerStatsPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: power-stats.v1");
    expect(contract).toContain("attackPotency: { tier: string, rank: 1-10 }");
    expect(contract).toContain("speed: { tier: string, rank: 1-10 }");
    expect(contract).toContain("durability: { tier: string, rank: 1-10 }");
    expect(contract).toContain("intelligence: { tier: string, rank: 1-10 }");
    expect(contract).toContain("hax: [{ name, type, bypassTier, limitations }]");
    expect(contract).toContain("vulnerabilities: [{ description, severity }]");
    expect(contract).toContain("bypassTier may be null");
    expect(contract).toContain("hax and vulnerabilities may be empty arrays");
    expect(contract).toContain("Rank within tier: Low = 1-3, Mid = 4-7, High = 8-10");
    expect(contract).toContain("Minimal valid output");
    expect(contract).toContain('"attackPotency": { "tier": "Street", "rank": 5 }');
    expect(contract).toContain("Invalid example");
    expect(contract).toContain("Do not return vague labels like \"strong\", \"godlike\", or \"unknown\"");
    expect(contract).toContain("Do not invent feats, tiers, source roles, or canonical facts");
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

  it("attaches PowerStats with VS Battles tiers from LLM assessment", async () => {
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
        attackPotency: { tier: "City Block", rank: 8 },
        speed: { tier: "Massively Hypersonic", rank: 7 },
        durability: { tier: "City Block", rank: 9 },
        intelligence: { tier: "Genius", rank: 8 },
        hax: [
          {
            name: "Infinity",
            type: "Spatial Manipulation",
            bypassTier: "City",
            limitations: ["Can be bypassed by Domain Expansion"],
          },
          {
            name: "Unlimited Void",
            type: "Domain Expansion",
            bypassTier: null,
            limitations: ["Requires hand signs", "Limited duration"],
          },
        ],
        vulnerabilities: [
          { description: "Political isolation from conservative jujutsu leadership", severity: "major" },
          { description: "Students can be used as leverage against him", severity: "critical" },
        ],
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

    // PowerStats should be attached
    expect(draft.powerStats).toBeDefined();
    expect(draft.powerStats?.attackPotency.tier).toBe("City Block");
    expect(draft.powerStats?.attackPotency.rank).toBe(8);
    expect(draft.powerStats?.speed.tier).toBe("Massively Hypersonic");
    expect(draft.powerStats?.durability.tier).toBe("City Block");
    expect(draft.powerStats?.intelligence.tier).toBe("Genius");
    expect(draft.powerStats?.hax).toHaveLength(2);
    expect(draft.powerStats?.hax[0]?.name).toBe("Infinity");
    expect(draft.powerStats?.hax[0]?.bypassTier).toBe("City");
    expect(draft.powerStats?.vulnerabilities).toHaveLength(2);
    expect(draft.powerStats?.vulnerabilities[0]?.severity).toBe("major");

    // Old fields should NOT be present
    expect((draft as unknown as Record<string, unknown>).grounding).toBeUndefined();

    // LLM prompt should include VS Battles tier names
    const prompt = (mockGenerateObject.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: power-stats.v1");
    expect(prompt).toContain("Minimal valid output");
    expect(prompt).toContain("Invalid example");
    expect(prompt).toContain("Do not invent feats, tiers, source roles, or canonical facts");
    expect(prompt).toContain("VS Battles");
    expect(prompt).toContain("City Block");
    expect(prompt).toContain("Massively Hypersonic");
    expect(prompt).toContain("Genius");
  });

  it("normalizes LLM tier output variants via coercion", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer",
        url: "https://example.com/gojo",
      },
    ]);
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        attackPotency: { tier: "city block", rank: 8 },
        speed: { tier: "MHS+", rank: 7 },
        durability: { tier: "city level", rank: 5 },
        intelligence: { tier: "genius level", rank: 8 },
        hax: [],
        vulnerabilities: [],
      },
    });

    const draft = await enrichKnownIpWorldgenNpcDraft({
      draft: makeDraft(),
      franchise: "Jujutsu Kaisen",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 5, searchProvider: "duckduckgo" },
      premise: "Jujutsu Kaisen.",
    });

    // Tier names should be normalized to canonical forms
    expect(draft.powerStats?.attackPotency.tier).toBe("City Block");
    expect(draft.powerStats?.speed.tier).toBe("Massively Hypersonic");
    expect(draft.powerStats?.durability.tier).toBe("City");
    expect(draft.powerStats?.intelligence.tier).toBe("Genius");
  });

  it("repairs malformed model output instead of failing the whole enrichment pass", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer, teacher at Tokyo Jujutsu High.",
        url: "https://example.com/gojo",
      },
    ]);
    // First call: malformed output
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          attack: "City Block level",
          speed: "MHS+",
          defense: "City Block",
          intelligence: "Genius",
        },
      })
      // Repair call: proper format
      .mockResolvedValueOnce({
        object: {
          attackPotency: { tier: "City Block", rank: 8 },
          speed: { tier: "Massively Hypersonic", rank: 7 },
          durability: { tier: "City Block", rank: 9 },
          intelligence: { tier: "Genius", rank: 8 },
          hax: [],
          vulnerabilities: [
            { description: "Sealing techniques", severity: "critical" },
          ],
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
    const repairPrompt = (mockGenerateObject.mock.calls[1]![0] as Record<string, unknown>)
      .prompt as string;
    expect(repairPrompt).toContain("STRUCTURED_OUTPUT_CONTRACT: power-stats.v1");
    expect(repairPrompt).toContain("Malformed raw payload");
    expect(repairPrompt).toContain("Do not return vague labels");
    expect(repairPrompt).toContain("Use only facts from the raw payload and search results");
    expect(draft.powerStats?.attackPotency.tier).toBe("City Block");
    expect(draft.powerStats?.vulnerabilities).toHaveLength(1);
  });

  it("requires power-stat repair to fail closed instead of inventing missing evidence", async () => {
    mockWebSearch.mockResolvedValueOnce([
      {
        title: "Satoru Gojo | Jujutsu Kaisen Wiki",
        description: "Special Grade sorcerer, teacher at Tokyo Jujutsu High.",
        url: "https://example.com/gojo",
      },
    ]);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          attack: "unknown",
          speed: "unknown",
          defense: "unknown",
          intelligence: "unknown",
        },
      })
      .mockResolvedValueOnce({
        object: {
          attack: "godlike",
          speed: "fast",
          defense: "durable",
          intelligence: "smart",
        },
      })
      .mockResolvedValueOnce({
        object: {
          attack: "godlike",
          speed: "fast",
          defense: "durable",
          intelligence: "smart",
        },
      })
      .mockResolvedValueOnce({
        object: {
          attack: "godlike",
          speed: "fast",
          defense: "durable",
          intelligence: "smart",
        },
      });

    await expect(
      enrichKnownIpWorldgenNpcDraft({
        draft: makeDraft(),
        franchise: "Jujutsu Kaisen",
        role: fakeRole,
        research: { enabled: true, maxSearchSteps: 5, searchProvider: "duckduckgo" },
        premise: "Jujutsu Kaisen.",
      }),
    ).rejects.toThrow();

    const repairPrompt = String(mockGenerateObject.mock.calls[1]?.[0]?.prompt ?? "");
    expect(repairPrompt).toContain("STRUCTURED_OUTPUT_CONTRACT: power-stats.v1");
    expect(repairPrompt).toContain("fail closed");
    expect(repairPrompt).toContain("must never invent power facts");
    expect(repairPrompt).toContain("Do not create new hax or vulnerabilities unless they are already supported");
  });
});

describe("normalizeLlmPowerStats", () => {
  function makeRawPowerStats(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      attackPotency: { tier: "City Block", rank: 8 },
      speed: { tier: "Massively Hypersonic", rank: 7 },
      durability: { tier: "City Block", rank: 9 },
      intelligence: { tier: "Genius", rank: 8 },
      hax: [],
      vulnerabilities: [],
      ...overrides,
    };
  }

  it("throws when any axis has a valid tier but missing rank", () => {
    expect(() =>
      normalizeLlmPowerStats(
        makeRawPowerStats({
          attackPotency: { tier: "City Block" },
        }),
      ),
    ).toThrow();
  });

  it.each([
    ["unknown", "unknown"],
    ["NaN", Number.NaN],
    ["zero", 0],
  ])("throws for invalid rank value %s", (_label, rank) => {
    expect(() =>
      normalizeLlmPowerStats(
        makeRawPowerStats({
          speed: { tier: "Massively Hypersonic", rank },
        }),
      ),
    ).toThrow();
  });

  it("accepts valid integer ranks 1 through 10, including trimmed numeric strings", () => {
    const parsed = normalizeLlmPowerStats(
      makeRawPowerStats({
        attackPotency: { tier: "City Block", rank: " 1 " },
        speed: { tier: "Massively Hypersonic", rank: " 10 " },
        durability: { tier: "City Block", rank: 4 },
        intelligence: { tier: "Genius", rank: 6 },
      }),
    );

    expect(parsed.attackPotency.rank).toBe(1);
    expect(parsed.speed.rank).toBe(10);
    expect(parsed.durability.rank).toBe(4);
    expect(parsed.intelligence.rank).toBe(6);

    for (let rank = 1; rank <= 10; rank += 1) {
      expect(
        normalizeLlmPowerStats(
          makeRawPowerStats({
            attackPotency: { tier: "City Block", rank },
          }),
        ).attackPotency.rank,
      ).toBe(rank);
    }
  });
});
