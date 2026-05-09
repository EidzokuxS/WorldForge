import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import rogueDraft from "./fixtures/draft-rogue.json" with { type: "json" };
import gojoDraft from "./fixtures/draft-gojo.json" with { type: "json" };
import gojoCard from "./fixtures/v2-gojo.json" with { type: "json" };

const enrichCalls: any[] = [];
const assessOrigCalls: any[] = [];
const enrichedStats = {
  attackPotency: { tier: "Universal", rank: 10 },
  durability: { tier: "Universal", rank: 10 },
  speed: { tier: "MFTL", rank: 9 },
  intelligence: { tier: "Extraordinary Genius", rank: 8 },
  hax: [],
  vulnerabilities: [],
};
const origStats = {
  attackPotency: { tier: "Street", rank: 4 },
  durability: { tier: "Street", rank: 3 },
  speed: { tier: "Human", rank: 7 },
  intelligence: { tier: "Above Average", rank: 6 },
  hax: [],
  vulnerabilities: [],
};

vi.mock("../../known-ip-worldgen-research.js", () => ({
  enrichKnownIpWorldgenNpcDraft: vi.fn(async (opts: any) => {
    enrichCalls.push(opts);
    return { ...opts.draft, powerStats: enrichedStats };
  }),
}));
vi.mock("../assess-original.js", () => ({
  assessOriginalCharacterPowerStats: vi.fn(async (opts: any) => {
    assessOrigCalls.push(opts);
    return { ...opts.draft, powerStats: origStats };
  }),
}));
vi.mock("../../../lib/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }),
}));

import { assessPowerStats } from "../power-assessor.js";
import { IngestionPipelineError } from "../errors.js";

const baseCtx: any = {
  gen: { provider: "glm", temperature: 0.3, maxTokens: 4096 },
  campaign: { premise: "world", ipContext: null, premiseDivergence: null },
  settings: { research: { enabled: true } },
  locationNames: [],
  factionNames: [],
};

const baseSources: any = {
  mode: "parse",
  role: "player",
  freeText: null,
  archetype: null,
  card: null,
  overrideText: null,
  displayName: null,
};

beforeEach(() => {
  enrichCalls.length = 0;
  assessOrigCalls.length = 0;
});

describe("assessPowerStats dispatcher", () => {
  it("dispatches known_ip_canonical to enrichKnownIpWorldgenNpcDraft with franchise + overrideText", async () => {
    const out = await assessPowerStats({
      draft: gojoDraft as unknown as CharacterDraft,
      sources: { ...baseSources, overrideText: "weaker than canon" },
      classification: {
        canonicalStatus: "known_ip_canonical",
        franchise: "Jujutsu Kaisen",
        ipContext: null,
        premiseDivergence: null,
      },
      researchDigest: "digest",
      ctx: baseCtx,
    });
    expect(enrichCalls).toHaveLength(1);
    expect(enrichCalls[0].franchise).toBe("Jujutsu Kaisen");
    expect(enrichCalls[0].overrideText).toBe("weaker than canon");
    expect(out.powerStats).toEqual(enrichedStats);
  });

  it("dispatches known_ip_diverged to enrichKnownIpWorldgenNpcDraft", async () => {
    await assessPowerStats({
      draft: gojoDraft as unknown as CharacterDraft,
      sources: baseSources,
      classification: {
        canonicalStatus: "known_ip_diverged",
        franchise: "Jujutsu Kaisen",
        ipContext: null,
        premiseDivergence: { notes: "diverged" } as any,
      },
      researchDigest: "digest",
      ctx: baseCtx,
    });
    expect(enrichCalls).toHaveLength(1);
  });

  it("dispatches original to assessOriginalCharacterPowerStats", async () => {
    const out = await assessPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      sources: { ...baseSources, mode: "parse", freeText: "a rogue" },
      classification: {
        canonicalStatus: "original",
        franchise: null,
        ipContext: null,
        premiseDivergence: null,
      },
      researchDigest: null,
      ctx: baseCtx,
    });
    expect(assessOrigCalls).toHaveLength(1);
    expect(out.powerStats).toEqual(origStats);
  });

  it("dispatches imported to assessOriginalCharacterPowerStats with card text", async () => {
    await assessPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      sources: {
        ...baseSources,
        mode: "import",
        card: gojoCard as any,
        displayName: "Gojo Satoru",
        overrideText: "civilian",
      },
      classification: {
        canonicalStatus: "imported",
        franchise: null,
        ipContext: null,
        premiseDivergence: null,
      },
      researchDigest: null,
      ctx: baseCtx,
    });
    expect(assessOrigCalls).toHaveLength(1);
    const call = assessOrigCalls[0];
    expect(call.cardText).toContain("The strongest sorcerer");
    expect(call.overrideText).toBe("civilian");
  });

  it("throws IngestionPipelineError when canon branch has no franchise", async () => {
    await expect(
      assessPowerStats({
        draft: gojoDraft as unknown as CharacterDraft,
        sources: baseSources,
        classification: {
          canonicalStatus: "known_ip_canonical",
          franchise: null,
          ipContext: null,
          premiseDivergence: null,
        },
        researchDigest: null,
        ctx: baseCtx,
      })
    ).rejects.toThrow(IngestionPipelineError);
  });

  it("throws IngestionPipelineError when research is disabled for canon branch", async () => {
    await expect(
      assessPowerStats({
        draft: gojoDraft as unknown as CharacterDraft,
        sources: baseSources,
        classification: {
          canonicalStatus: "known_ip_canonical",
          franchise: "Jujutsu Kaisen",
          ipContext: null,
          premiseDivergence: null,
        },
        researchDigest: null,
        ctx: { ...baseCtx, settings: { research: { enabled: false } } },
      })
    ).rejects.toThrow(IngestionPipelineError);
  });

  it("returned draft always has non-undefined powerStats", async () => {
    const out = await assessPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      sources: baseSources,
      classification: {
        canonicalStatus: "original",
        franchise: null,
        ipContext: null,
        premiseDivergence: null,
      },
      researchDigest: null,
      ctx: baseCtx,
    });
    expect(out.powerStats).toBeDefined();
    expect(out.powerStats!.hax).toBeDefined();
    expect(out.powerStats!.vulnerabilities).toBeDefined();
  });
});
