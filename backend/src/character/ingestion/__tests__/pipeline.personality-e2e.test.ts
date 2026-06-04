import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestionContext, IngestionInput } from "../types.js";

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("../../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: mockGenerateObject,
}));

vi.mock("../../../ai/index.js", () => ({
  createModel: vi.fn(() => ({ modelId: "mock" })),
}));

vi.mock("../power-assessor.js", () => ({
  assessPowerStats: vi.fn(async ({ draft }: { draft: Record<string, unknown> }) => ({
    ...draft,
    powerStats: {
      attackPotency: { tier: "Street", rank: 2 },
      durability: { tier: "Street", rank: 2 },
      speed: { tier: "Athlete", rank: 2 },
      intelligence: { tier: "Skilled", rank: 3 },
      hax: [],
      vulnerabilities: [],
    },
  })),
}));

vi.mock("../../archetype-researcher.js", () => ({
  researchArchetype: vi.fn(async () => "VOICE: blunt scout with command cadence"),
}));

vi.mock("../../../lib/index.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  }),
}));

import { ingestCharacterDraft } from "../pipeline.js";

const baseRich = {
  name: "Vera Holt",
  race: "Human",
  gender: "Female",
  age: "29",
  appearance: "Lean, sun-burned, watchful eyes.",
  backgroundSummary: "A frontier scout who learned to move before others could aim.",
  personaSummary: "Curt and unsentimental, but never careless with another life.",
  personalitySummary: "Driven scout who trusts motion more than promises.",
  personalityVoice: "Curt, military jargon, sparse metaphors, no sentimental drift.",
  personalityDecisionStyle: "Acts first, justifies later when time matters.",
  personalityWorldview: "Pragmatist who assumes the world punishes hesitation.",
  personalityContradictions: [
    "Believes caution keeps people alive, but takes reckless point position herself.",
  ],
  personalityMythology: "I am the eyes of the regiment, even when the regiment is gone.",
  personalitySampleLines: ["State your business.", "We move at dawn."],
  tags: ["Scout", "Veteran", "Pragmatic"],
  drives: [],
  frictions: [],
  shortTermGoals: [],
  longTermGoals: [],
  hp: 5,
  equippedItems: ["Field Knife"],
  locationName: "Dust Market",
};

const baseCtx: IngestionContext = {
  gen: {
    provider: { id: "glm", protocol: "openai" } as never,
    temperature: 0.4,
    maxTokens: 2048,
  } as never,
  campaign: {
    premise: "Harsh desert frontier where old forts still matter.",
    ipContext: null,
    premiseDivergence: null,
  },
  settings: {
    research: {
      enabled: true,
      provider: "brave",
      braveApiKey: "test-key",
      maxSearchSteps: 2,
    },
  } as never,
  locationNames: ["Dust Market", "Old Fort"],
  factionNames: ["Frontier Wardens"],
};

describe("ingestCharacterDraft personality e2e", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateObject.mockImplementation(async (opts: { prompt?: string }) => {
      const prompt = opts.prompt ?? "";
      const mesExampleQuote = '"Move out, on me. No second pass."';
      return {
        object: prompt.includes(mesExampleQuote)
          ? {
              ...baseRich,
              personalitySampleLines: [
                "Move out, on me. No second pass.",
                "Eyes up. We clear it once.",
              ],
            }
          : baseRich,
      };
    });
  });

  async function run(input: IngestionInput) {
    return await ingestCharacterDraft(input, baseCtx);
  }

  it("returns personality for parse mode", async () => {
    const draft = await run({
      mode: "parse",
      campaignId: "camp-1",
      role: "player",
      freeText: "A scout from the eastern dunes.",
    });

    expect(draft.identity.personality?.summary).toBeTruthy();
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({ retries: 1 });
  });

  it("returns personality for generate mode", async () => {
    const draft = await run({
      mode: "generate",
      campaignId: "camp-1",
      role: "player",
    });

    expect(draft.identity.personality?.summary).toBeTruthy();
  });

  it("returns personality for research mode", async () => {
    const draft = await run({
      mode: "research",
      campaignId: "camp-1",
      role: "player",
      archetype: "desert ranger",
    });

    expect(draft.identity.personality?.summary).toBeTruthy();
  });

  it("threads mesExample quotes into import mode personality sampleLines", async () => {
    const draft = await run({
      mode: "import",
      campaignId: "camp-1",
      role: "player",
      v2Card: {
        name: "Vera Holt",
        description: "A disciplined scout from the dunes.",
        personality: "Cautious until the line breaks.",
        scenario: "Preparing a dawn raid.",
        tags: ["Scout", "Veteran"],
        mesExample:
          '<START>\n{{char}}: "Move out, on me. No second pass."\n{{user}}: "Thought you said wait."\n<START>\n{{char}}: "Eyes up. We clear it once."',
        importMode: "native",
      },
    });

    expect(draft.identity.personality?.summary).toBeTruthy();
    expect(draft.identity.personality?.sampleLines).toContain(
      "Move out, on me. No second pass.",
    );
  });

  it("maps key-role imports to npc identity so route responses stay on the NPC contract", async () => {
    const draft = await run({
      mode: "import",
      campaignId: "camp-1",
      role: "key",
      v2Card: {
        name: "Kafka",
        description: "A composed fighter with a hidden agenda.",
        personality: "Dry, observant, and hard to read.",
        scenario: "Watching the station from above.",
        tags: ["Observer", "Fighter"],
        mesExample: "",
        importMode: "outsider",
      },
    });

    expect(draft.identity.role).toBe("npc");
    expect(draft.identity.tier).toBe("key");
  });
});
