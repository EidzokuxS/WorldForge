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
  withSearchMcp: vi.fn(async (_provider: string, fn: (tools: unknown) => Promise<unknown>) => fn({})),
}));

import { researchArchetype } from "../archetype-researcher.js";

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

  it("returns researched text when MCP tool execution succeeds", async () => {
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

  it("returns null when MCP-backed research fails", async () => {
    const { withSearchMcp } = await import("../../lib/index.js");
    vi.mocked(withSearchMcp).mockRejectedValueOnce(new Error("MCP failed"));

    const result = await researchArchetype({
      archetype: "Unknown",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
  });

  it("returns null when MCP-backed research returns empty text", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "" });

    const result = await researchArchetype({
      archetype: "Ranger",
      role: fakeRole,
      research: { enabled: true, maxSearchSteps: 3, searchProvider: "duckduckgo" },
    });

    expect(result).toBeNull();
  });
});

function makeDraft(): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Captain Mire",
      canonicalStatus: "known_ip_canonical",
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
  };
}

// describe("synthesizeArchetypePowerStats") removed in Phase 60-04: the function
// was deleted. PowerStats assessment is now performed by the ingestion pipeline's
// Stage 4 dispatcher (backend/src/character/ingestion/power-assessor.ts). See
// ingestion/__tests__/power-assessor.test.ts and assess-original.test.ts.
