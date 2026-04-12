import { describe, it, expect, vi } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  stepCountIs: vi.fn(() => () => false),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: vi.fn().mockRejectedValue(new Error("MCP not available")),
}));

vi.mock("@ai-sdk/mcp/mcp-stdio", () => ({
  Experimental_StdioMCPTransport: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  withMcpClient: vi.fn(async (_fn: unknown, fallbackFn: () => Promise<unknown>) => fallbackFn()),
}));

import {
  researchArchetype,
  synthesizeArchetypeGrounding,
} from "../archetype-researcher.js";

const fakeRole = {
  provider: { id: "test", name: "Test Provider", baseUrl: "https://example.com", apiKey: "sk-test", model: "gpt-4" },
  temperature: 0.7,
  maxTokens: 2048,
};

describe("researchArchetype", () => {
  it("returns null when research is disabled", async () => {
    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: false, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to LLM when MCP fails", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Rangers are skilled trackers and survivalists.",
    });

    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBe("Rangers are skilled trackers and survivalists.");
    const prompt = (mockGenerateText.mock.calls[0]![0] as Record<string, unknown>)
      .prompt as string;
    expect(prompt).toContain("profile");
    expect(prompt).toContain("motivations");
    expect(prompt).toContain("capabilities");
    expect(prompt).toContain("signature traits");
    expect(prompt).not.toContain("3-5 paragraphs suitable for inspiring an original RPG character");
  });

  it("returns null when both MCP and LLM fallback fail", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("LLM failed"));

    const result = await researchArchetype({
      archetype: "Unknown",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
  });

  it("returns null when LLM returns empty text", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "" });

    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
  });
});

function makeDraft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Captain Mire",
      canonicalStatus: "known_ip_canonical",
      baseFacts: {
        biography: "A veteran signal-station commander.",
        socialRole: ["captain", "warden"],
        hardConstraints: ["Will not abandon the station"],
      },
      behavioralCore: {
        motives: ["Protect the valley"],
        pressureResponses: ["Turns colder under pressure"],
        taboos: ["Will not lie to subordinates"],
        attachments: ["The station crew"],
        selfImage: "Guardian of the northern line",
      },
      liveDynamics: {
        activeGoals: ["Hold the barricade"],
        beliefDrift: ["The valley can still be saved"],
        currentStrains: ["Running out of supplies"],
        earnedChanges: [],
      },
    },
    profile: {
      species: "Human",
      gender: "Female",
      ageText: "42",
      appearance: "Storm-scarred uniform and frost-burned hands.",
      backgroundSummary: "Raised inside the watchtowers of the north.",
      personaSummary: "Commanding, clipped, and exhausted.",
    },
    socialContext: {
      factionId: "faction-wardens",
      factionName: "Wardens",
      homeLocationId: "loc-station",
      homeLocationName: "Signal Station",
      currentLocationId: "loc-barricade",
      currentLocationName: "North Barricade",
      relationshipRefs: [],
      socialStatus: ["Respected"],
      originMode: "resident",
    },
    motivations: {
      shortTermGoals: ["Hold the barricade"],
      longTermGoals: ["Restore order in the valley"],
      beliefs: ["The valley can still be saved"],
      drives: ["Duty"],
      frictions: ["Suspicious of outsiders"],
    },
    capabilities: {
      traits: ["Disciplined", "Tactical"],
      skills: [{ name: "Negotiation", tier: "Master" }],
      flaws: ["Can be isolated"],
      specialties: ["Signal doctrine", "Command under siege"],
      wealthTier: "Comfortable",
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Signal key"],
      equippedItemRefs: ["Officer Saber"],
      currencyNotes: "",
      signatureItems: ["Signal key"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "import",
      importMode: "native",
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: "known-ip",
      legacyTags: ["legacy"],
    },
    sourceBundle: {
      canonSources: [
        {
          kind: "canon",
          label: "Station Chronicle",
          excerpt: "Captain Mire held the relay through the final evacuation.",
        },
      ],
      secondarySources: [
        {
          kind: "card",
          label: "Community notes",
          excerpt: "Voice is clipped, exhausted, and iron-hard.",
        },
      ],
      synthesis: {
        owner: "worldforge",
        strategy: "canon-forward",
        notes: ["Merged canon history with voice cues."],
      },
    },
    continuity: {
      identityInertia: "anchored",
      protectedCore: ["Will not abandon the station"],
      mutableSurface: ["Trust in the player"],
      changePressureNotes: ["Repeated defeats may break command certainty."],
    },
    ...overrides,
  };
}

describe("synthesizeArchetypeGrounding", () => {
  it("converts research context into durable canon and power grounding", () => {
    const grounding = synthesizeArchetypeGrounding({
      archetype: "Signal-station commander",
      researchContext:
        "Captain Mire is known for holding the northern relay through repeated sieges. Canon sources stress battlefield command, relay tactics, and a refusal to abandon civilians.",
      draft: makeDraft(),
    });

    expect(grounding).toBeDefined();
    expect(grounding?.summary).toContain("Signal-station commander");
    expect(grounding?.facts).toContain("A veteran signal-station commander.");
    expect(grounding?.signatureMoves).toEqual(
      expect.arrayContaining(["Signal doctrine", "Command under siege"]),
    );
    expect(grounding?.powerProfile?.strengths).toEqual(
      expect.arrayContaining(["Disciplined", "Tactical"]),
    );
    expect(grounding?.powerProfile?.constraints).toEqual(
      expect.arrayContaining(["Will not abandon the station"]),
    );
    expect(grounding?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "canon", label: "Station Chronicle" }),
        expect.objectContaining({ kind: "research", label: "Archetype research" }),
      ]),
    );
    expect(grounding?.uncertaintyNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bounded"),
      ]),
    );
  });

  it("keeps uncertainty explicit when research input is sparse", () => {
    const grounding = synthesizeArchetypeGrounding({
      archetype: "Unknown wanderer",
      researchContext: null,
      draft: makeDraft({
        sourceBundle: undefined,
      }),
    });

    expect(grounding).toBeDefined();
    expect(grounding?.sources).toEqual([]);
    expect(grounding?.uncertaintyNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No external research summary"),
      ]),
    );
    expect(grounding?.powerProfile?.uncertaintyNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bounded"),
      ]),
    );
  });
});
