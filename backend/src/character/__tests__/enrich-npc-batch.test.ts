import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft, PowerStats } from "@worldforge/shared";
import type {
  IngestionClassification,
  IngestionContext,
} from "../ingestion/types.js";
import { IngestionPipelineError } from "../ingestion/errors.js";
import { withPipelineRetry } from "../ingestion/retry.js";

vi.mock("../ingestion/power-assessor.js", () => ({
  assessPowerStats: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  }),
}));

import { enrichNpcsBatch, type EnrichNpcsBatchItem } from "../enrich-npc-batch.js";
import { assessPowerStats } from "../ingestion/power-assessor.js";

function makeDraft(
  name: string,
  overrides: Partial<CharacterDraft> = {},
): CharacterDraft {
  return {
    identity: {
      role: "npc",
      tier: "key",
      displayName: name,
      canonicalStatus: "original",
      personality: {
        summary: "A careful operator.",
        voice: "Clipped and wary.",
        decisionStyle: "Fast and pragmatic.",
        worldview: "Survival favors preparation.",
        internalContradictions: ["Trusts nobody, protects everybody."],
        personalMythology: "If I miss the danger, others pay for it.",
        sampleLines: ["Move first, explain later."],
      },
      ...overrides.identity,
    },
    profile: {
      species: "",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "A capable operator.",
      ...overrides.profile,
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Tavern",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "resident",
      ...overrides.socialContext,
    },
    motivations: {
      shortTermGoals: ["Hold the line"],
      longTermGoals: ["Keep the city intact"],
      beliefs: [],
      drives: [],
      frictions: [],
      ...overrides.motivations,
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
      ...overrides.capabilities,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
      ...overrides.state,
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
      ...overrides.loadout,
    },
    startConditions: {
      startLocationId: null,
      arrivalMode: null,
      immediateSituation: null,
      entryPressure: [],
      companions: [],
      startingVisibility: null,
      resolvedNarrative: null,
      sourcePrompt: null,
      ...overrides.startConditions,
    },
    provenance: {
      sourceKind: "worldgen",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
      ...overrides.provenance,
    },
    powerStats: overrides.powerStats,
  };
}

function makePowerStats(): PowerStats {
  return {
    attackPotency: { tier: "Street", rank: 4 },
    durability: { tier: "Street", rank: 4 },
    speed: { tier: "Human", rank: 6 },
    intelligence: { tier: "Above Average", rank: 6 },
    hax: [],
    vulnerabilities: [],
  };
}

function makeCtx(): IngestionContext {
  return {} as unknown as IngestionContext;
}

function classificationKnownIp(): IngestionClassification {
  return {
    canonicalStatus: "known_ip_canonical",
    franchise: "TestFranchise",
    ipContext: null,
    premiseDivergence: null,
  };
}

function classificationOriginal(): IngestionClassification {
  return {
    canonicalStatus: "original",
    franchise: null,
    ipContext: null,
    premiseDivergence: null,
  };
}

describe("enrichNpcsBatch", () => {
  beforeEach(() => {
    vi.mocked(assessPowerStats).mockReset();
    vi.mocked(assessPowerStats).mockImplementation(async ({ draft }) => ({
      ...draft,
      powerStats: makePowerStats(),
    }));
  });

  it("routes known-IP key tier to assessPowerStats with canonicalStatus='known_ip_canonical' (D-01)", async () => {
    const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Key Canon"), tier: "key" }];

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationKnownIp(),
      ctx: makeCtx(),
    });

    expect(vi.mocked(assessPowerStats)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(assessPowerStats).mock.calls[0]?.[0];
    expect(call?.classification.canonicalStatus).toBe("known_ip_canonical");
    expect(call?.classification.franchise).toBe("TestFranchise");
  });

  it("routes known-IP supporting tier to assessPowerStats with canonicalStatus='known_ip_canonical' (D-01)", async () => {
    const items: EnrichNpcsBatchItem[] = [
      { draft: makeDraft("Supporting Canon"), tier: "supporting" },
    ];

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationKnownIp(),
      ctx: makeCtx(),
    });

    const call = vi.mocked(assessPowerStats).mock.calls[0]?.[0];
    expect(call?.classification.canonicalStatus).toBe("known_ip_canonical");
    expect(call?.classification.franchise).toBe("TestFranchise");
  });

  it("routes original-world key tier to assessPowerStats with canonicalStatus='original' (D-02)", async () => {
    const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Key Original"), tier: "key" }];

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationOriginal(),
      ctx: makeCtx(),
    });

    const call = vi.mocked(assessPowerStats).mock.calls[0]?.[0];
    expect(call?.classification.canonicalStatus).toBe("original");
    expect(call?.classification.franchise).toBeNull();
  });

  it("routes original-world supporting tier to assessPowerStats with canonicalStatus='original' (D-02)", async () => {
    const items: EnrichNpcsBatchItem[] = [
      { draft: makeDraft("Supporting Original"), tier: "supporting" },
    ];

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationOriginal(),
      ctx: makeCtx(),
    });

    const call = vi.mocked(assessPowerStats).mock.calls[0]?.[0];
    expect(call?.classification.canonicalStatus).toBe("original");
    expect(call?.classification.franchise).toBeNull();
  });

  it("fans out mixed tiers under a shared known-IP batch correctly", async () => {
    const items: EnrichNpcsBatchItem[] = [
      { draft: makeDraft("N1"), tier: "key" },
      { draft: makeDraft("N2"), tier: "supporting" },
      { draft: makeDraft("N3"), tier: "key" },
      { draft: makeDraft("N4"), tier: "supporting" },
    ];

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationKnownIp(),
      ctx: makeCtx(),
    });

    expect(vi.mocked(assessPowerStats)).toHaveBeenCalledTimes(4);
    const statuses = vi
      .mocked(assessPowerStats)
      .mock.calls.map((call) => call[0]?.classification.canonicalStatus);
    expect(statuses).toEqual([
      "known_ip_canonical",
      "known_ip_canonical",
      "known_ip_canonical",
      "known_ip_canonical",
    ]);
  });

  it("anti-nested-retry: original-branch leaf failure hits exactly 3 attempts, not 9 (Codex HIGH-1)", async () => {
    let leafCalls = 0;
    vi.mocked(assessPowerStats).mockImplementation(async () => {
      return await withPipelineRetry("power_assess", async () => {
        leafCalls++;
        throw new Error("leaf failure");
      });
    });

    const items: EnrichNpcsBatchItem[] = [
      { draft: makeDraft("Doomed"), tier: "supporting" },
    ];

    await expect(
      enrichNpcsBatch({
        items,
        buildClassification: () => classificationOriginal(),
        ctx: makeCtx(),
      }),
    ).rejects.toMatchObject({
      name: "IngestionPipelineError",
      stage: "power_assess",
      attempts: 3,
    });

    expect(leafCalls).toBe(3);

    const source = readFileSync(
      new URL("../enrich-npc-batch.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("withPipelineRetry");
  }, 15000);

  it("propagates IngestionPipelineError from assessPowerStats unchanged (fail-closed)", async () => {
    const originalError = new IngestionPipelineError({
      stage: "power_assess",
      attempts: 3,
      cause: new Error("inner"),
      message: "canon lookup exhausted",
    });
    vi.mocked(assessPowerStats).mockRejectedValue(originalError);

    const items: EnrichNpcsBatchItem[] = [{ draft: makeDraft("Doomed"), tier: "key" }];

    let caught: unknown;
    try {
      await enrichNpcsBatch({
        items,
        buildClassification: () => classificationKnownIp(),
        ctx: makeCtx(),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(originalError);
  });

  it("bounds concurrency to at most 4 inflight assessPowerStats calls (D-05)", async () => {
    let inflight = 0;
    const observed: number[] = [];
    vi.mocked(assessPowerStats).mockImplementation(async ({ draft }) => {
      inflight++;
      observed.push(inflight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inflight--;
      return { ...draft, powerStats: makePowerStats() };
    });

    const items: EnrichNpcsBatchItem[] = Array.from({ length: 10 }, (_, index) => ({
      draft: makeDraft(`N${index}`),
      tier: "supporting",
    }));

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationOriginal(),
      ctx: makeCtx(),
    });

    expect(Math.max(...observed)).toBeLessThanOrEqual(4);
    expect(vi.mocked(assessPowerStats)).toHaveBeenCalledTimes(10);
  });

  it("honors concurrency override (concurrency: 1 -> strictly serial)", async () => {
    let inflight = 0;
    const observed: number[] = [];
    vi.mocked(assessPowerStats).mockImplementation(async ({ draft }) => {
      inflight++;
      observed.push(inflight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inflight--;
      return { ...draft, powerStats: makePowerStats() };
    });

    const items: EnrichNpcsBatchItem[] = Array.from({ length: 3 }, (_, index) => ({
      draft: makeDraft(`S${index}`),
      tier: "key",
    }));

    await enrichNpcsBatch({
      items,
      buildClassification: () => classificationKnownIp(),
      ctx: makeCtx(),
      concurrency: 1,
    });

    expect(Math.max(...observed)).toBe(1);
  });

  it("returns empty array for empty batch without calling assessPowerStats", async () => {
    const result = await enrichNpcsBatch({
      items: [],
      buildClassification: () => classificationOriginal(),
      ctx: makeCtx(),
    });

    expect(result).toEqual([]);
    expect(assessPowerStats).not.toHaveBeenCalled();
  });
});
