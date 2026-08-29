import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IngestionClassification,
  IngestionContext,
  IngestionSources,
} from "../types.js";

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("../../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: mockGenerateObject,
}));

vi.mock("../../../ai/index.js", () => ({
  createModel: vi.fn(() => ({ modelId: "mock" })),
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

import { synthesizeDraftFromSources } from "../synthesizer.js";
import { richCharacterSchema } from "../../generator.js";

const richOutput = {
  name: "Vera Holt",
  race: "Human",
  gender: "Female",
  age: "29",
  appearance: "Lean, sun-burned, watchful eyes.",
  backgroundSummary: "A frontier scout who learned to move before others could aim.",
  personaSummary: "Curt and unsentimental, but never careless with another life.",
  drives: [],
  frictions: [],
  shortTermGoals: [],
  longTermGoals: [],
  tags: ["Scout", "Veteran", "Pragmatic"],
  hp: 5,
  equippedItems: ["Field Knife"],
  locationName: "Dust Market",
  personalitySummary: "Driven scout who trusts motion more than promises.",
  personalityVoice: "Curt, military jargon, sparse metaphors, no sentimental drift.",
  personalityDecisionStyle: "Acts first, justifies later when time matters.",
  personalityWorldview: "Pragmatist who assumes the world punishes hesitation.",
  personalityContradictions: ["Believes caution keeps people alive, but takes reckless point position herself."],
  personalityMythology: "I am the eyes of the regiment, even when the regiment is gone.",
  personalitySampleLines: ["State your business.", "We move at dawn."],
};

const ctx: IngestionContext = {
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
  settings: {} as never,
  locationNames: ["Dust Market", "Old Fort"],
  factionNames: ["Frontier Wardens"],
};

const classification: IngestionClassification = {
  canonicalStatus: "original",
  franchise: null,
  ipContext: null,
  premiseDivergence: null,
};

function sources(partial: Partial<IngestionSources> = {}): IngestionSources {
  return {
    mode: "parse",
    role: "player",
    freeText: "A scout from the eastern dunes.",
    archetype: null,
    card: null,
    overrideText: null,
    displayName: null,
    ...partial,
  } as IngestionSources;
}

function getGenerationSchema() {
  const schema = mockGenerateObject.mock.calls[0]?.[0]?.schema;
  expect(schema).toBeDefined();
  return schema as typeof richCharacterSchema;
}

describe("synthesizeDraftFromSources personality lift", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateObject.mockResolvedValue({ object: richOutput });
  });

  it("lifts personality flat keys into identity.personality", async () => {
    const draft = await synthesizeDraftFromSources({
      sources: sources(),
      classification,
      researchDigest: null,
      ctx,
    });

    expect(draft.identity.personality).toBeDefined();
    expect(draft.identity.personality!).toEqual({
      summary: "Driven scout who trusts motion more than promises.",
      voice: "Curt, military jargon, sparse metaphors, no sentimental drift.",
      decisionStyle: "Acts first, justifies later when time matters.",
      worldview: "Pragmatist who assumes the world punishes hesitation.",
      internalContradictions: [
        "Believes caution keeps people alive, but takes reckless point position herself.",
      ],
      personalMythology: "I am the eyes of the regiment, even when the regiment is gone.",
      sampleLines: ["State your business.", "We move at dawn."],
    });
    expect(draft.identity.personality!.sampleLines).toHaveLength(2);
    expect(draft.identity.behavioralCore?.motives ?? []).toEqual([]);
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({ retries: 1 });
  });

  it("accepts empty personalitySampleLines at the schema layer", () => {
    expect(() =>
      richCharacterSchema.parse({
        ...richOutput,
        personalitySampleLines: [],
      }),
    ).not.toThrow();
  });

  it("normalizes oversized personality fields and string contradictions before draft lift", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        drives: "Protect the people under her watch; Keep control of the field",
        frictions:
          "Distrusts commanders who spend lives casually; Resents being slowed by politics",
        shortTermGoals:
          "Scout the ridge before dawn; Get the convoy through the canyon intact",
        longTermGoals:
          "Train a replacement scout team; Break the dependency on one overworked veteran",
        personalitySummary: "A".repeat(480),
        personalityDecisionStyle: "B".repeat(460),
        personalityWorldview: "C".repeat(470),
        personalityMythology: "D".repeat(430),
        hp: 9,
        tags: "Scout; Veteran; Pragmatic",
        equippedItems: "Field Knife; Compass",
        locationName: "Unknown Outpost",
        personalityContradictions:
          "Openly denies fear while hoarding contingency plans for every encounter; Wants connection but treats every ally as expendable until proven otherwise",
      },
    });

    const draft = await synthesizeDraftFromSources({
      sources: sources(),
      classification,
      researchDigest: null,
      ctx,
    });

    expect(draft.identity.personality?.summary.length).toBeLessThanOrEqual(400);
    expect(draft.identity.personality?.decisionStyle.length).toBeLessThanOrEqual(400);
    expect(draft.identity.personality?.worldview.length).toBeLessThanOrEqual(400);
    expect(draft.identity.personality?.personalMythology.length).toBeLessThanOrEqual(400);
    expect(draft.state.hp).toBe(5);
    expect(draft.socialContext.currentLocationName).toBe("Dust Market");
    expect(draft.capabilities.traits).toEqual([
      "Scout",
      "Veteran",
      "Pragmatic",
    ]);
    expect(draft.identity.personality?.internalContradictions).toEqual([
      "Openly denies fear while hoarding contingency plans for every encounter",
      "Wants connection but treats every ally as expendable until proven otherwise",
    ]);
    expect(draft.motivations.drives).toEqual([
      "Protect the people under her watch",
      "Keep control of the field",
    ]);
    expect(draft.motivations.frictions).toEqual([
      "Distrusts commanders who spend lives casually",
      "Resents being slowed by politics",
    ]);
    expect(draft.motivations.shortTermGoals).toEqual([
      "Scout the ridge before dawn",
      "Get the convoy through the canyon intact",
    ]);
    expect(draft.motivations.longTermGoals).toEqual([
      "Train a replacement scout team",
      "Break the dependency on one overworked veteran",
    ]);
  });

  it("decodes provider stringified arrays before draft lift", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        drives: '["Protect the convoy","Keep the route open"]',
        tags: '["Scout","Veteran","Pragmatic"]',
        equippedItems: '["Field Knife","Compass"]',
        personalityContradictions: '["Plans every risk","Moves before the plan is complete"]',
      },
    });

    const draft = await synthesizeDraftFromSources({
      sources: sources(),
      classification,
      researchDigest: null,
      ctx,
    });

    expect(draft.motivations.drives).toEqual([
      "Protect the convoy",
      "Keep the route open",
    ]);
    expect(draft.capabilities.traits).toEqual(["Scout", "Veteran", "Pragmatic"]);
    expect(draft.loadout.inventorySeed).toEqual(["Field Knife", "Compass"]);
    expect(draft.identity.personality?.internalContradictions).toEqual([
      "Plans every risk",
      "Moves before the plan is complete",
    ]);
    expect(draft.identity.personality?.sampleLines).toEqual([
      "State your business.",
      "We move at dawn.",
    ]);
  });

  it("rejects a scalar stringified personality sample array at the generation schema", async () => {
    await synthesizeDraftFromSources({
      sources: sources(),
      classification,
      researchDigest: null,
      ctx,
    });

    const result = getGenerationSchema().safeParse({
      ...richOutput,
      personalitySampleLines: '["State your business.","We move at dawn."]',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["personalitySampleLines"] }),
    ]));
  });

  it("rejects a malformed aggregate inside personality sample lines", async () => {
    await synthesizeDraftFromSources({
      sources: sources(),
      classification,
      researchDigest: null,
      ctx,
    });

    const malformedAggregate =
      `["I'll carry it, but if the water's over the landing stage by noon, I'm setting it down somewhere dry and that's that.", ` +
      `"You want it at the warehouse door or the customs lane? Not both for one fee.", ` +
      `"I don't ask what's in the bundle. I ask where it's going and whether the door's watched for me.`;
    expect(malformedAggregate).toHaveLength(297);

    const result = getGenerationSchema().safeParse({
      ...richOutput,
      personalitySampleLines: [malformedAggregate],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ["personalitySampleLines", 0],
        message: "one spoken line is required, not encoded array/object data",
      }),
    ]));
  });

  it("accepts separate spoken sample lines and preserves them in the draft", async () => {
    const sampleLines = [
      "I'll carry it straight to the clerk.",
      '"You want it at the warehouse door?"',
    ];
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        personalitySampleLines: sampleLines,
      },
    });

    const draft = await synthesizeDraftFromSources({
      sources: sources(),
      classification,
      researchDigest: null,
      ctx,
    });

    const result = getGenerationSchema().safeParse({
      ...richOutput,
      personalitySampleLines: sampleLines,
    });
    expect(result.success).toBe(true);
    expect(draft.identity.personality?.sampleLines).toEqual(sampleLines);
  });

  it("forces imported characters to start at 5 hp even if the model returns a lower value", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        hp: 4,
      },
    });

    const draft = await synthesizeDraftFromSources({
      sources: sources({
        mode: "import",
        card: {
          name: "Tiamat",
          description: "Ancient dragon shard evaluating this world in human form.",
          personality: "Calm, direct, fascinated by worthy opponents.",
          scenario: "Arrived recently to judge this realm.",
          tags: ["Dragon Shard", "Arbiter"],
          mesExample: "",
          importMode: "outsider",
        } as never,
      }),
      classification,
      researchDigest: null,
      ctx,
    });

    expect(draft.state.hp).toBe(5);
  });

  it("keeps imported characters at 5 hp even when source flavor mentions injury", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        hp: 4,
      },
    });

    const draft = await synthesizeDraftFromSources({
      sources: sources({
        mode: "import",
        card: {
          name: "Vera Holt",
          description: "A wounded scout limping after a brutal ambush.",
          personality: "Pragmatic and hurting, but still dangerous.",
          scenario: "Bleeding through a field dressing after escaping the ridge.",
          tags: ["Scout", "Wounded"],
          mesExample: "",
          importMode: "outsider",
        } as never,
      }),
      classification,
      researchDigest: null,
      ctx,
    });

    expect(draft.state.hp).toBe(5);
  });

  it("preserves authored imported tags when the model returns no usable tags", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        tags: [],
      },
    });

    const authoredTags = ["Storm Listener", "Harbor Mechanic", "Signal Keeper"];
    const draft = await synthesizeDraftFromSources({
      sources: sources({
        mode: "import",
        card: {
          name: "Mara Venn",
          description: "A mechanic who hears a structured signal inside the storm.",
          personality: "Patient, observant, and privately superstitious.",
          scenario: "She has just reached the rain-soaked port city.",
          tags: authoredTags,
          mesExample: "",
          importMode: "outsider",
        } as never,
      }),
      classification,
      researchDigest: null,
      ctx,
    });

    expect(draft.capabilities.traits).toEqual(authoredTags);
  });

  it("does not fabricate tags when both the card and model provide none", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...richOutput,
        tags: [],
      },
    });

    await expect(synthesizeDraftFromSources({
      sources: sources({
        mode: "import",
        card: {
          name: "Mara Venn",
          description: "A mechanic who hears a structured signal inside the storm.",
          personality: "Patient, observant, and privately superstitious.",
          scenario: "She has just reached the rain-soaked port city.",
          tags: [],
          mesExample: "",
          importMode: "outsider",
        } as never,
      }),
      classification,
      researchDigest: null,
      ctx,
    })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["tags"] }),
      ]),
    });
  });
});
