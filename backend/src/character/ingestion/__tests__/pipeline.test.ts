import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IngestionContext, IngestionInput } from "../types.js";
import gojoCard from "./fixtures/v2-gojo.json" with { type: "json" };

const mockDraft = {
  identity: { displayName: "Gojo Satoru", race: "Human", gender: "male", age: "28", appearance: "white hair" },
  profile: { backgroundSummary: "x", personaSummary: "y" },
  motivations: { drives: [], frictions: [], shortTermGoals: [], longTermGoals: [] },
  capabilities: { traits: [], skills: [] },
  loadout: { equippedItems: [], locationName: "Jujutsu High" },
  hp: 5,
  provenance: { sourceKind: "import", canonicalStatus: "known_ip_canonical" },
};
const mockStats = {
  attackPotency: { tier: "Universal", rank: 10 },
  durability: { tier: "Universal", rank: 10 },
  speed: { tier: "MFTL", rank: 9 },
  intelligence: { tier: "Extraordinary Genius", rank: 8 },
  hax: [],
  vulnerabilities: [],
};

vi.mock("../synthesizer.js", () => ({
  synthesizeDraftFromSources: vi.fn(async (opts: any) => ({
    ...mockDraft,
    provenance: {
      ...mockDraft.provenance,
      overrideText: opts.sources.overrideText ?? undefined,
    },
  })),
}));
vi.mock("../power-assessor.js", () => ({
  assessPowerStats: vi.fn(async (opts: any) => ({ ...opts.draft, powerStats: mockStats })),
}));
vi.mock("../../archetype-researcher.js", () => ({
  researchArchetype: vi.fn(async () => "MOCK_RESEARCH_DIGEST"),
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
import { synthesizeDraftFromSources } from "../synthesizer.js";
import { assessPowerStats } from "../power-assessor.js";
import { researchArchetype } from "../../archetype-researcher.js";

const baseCtx: IngestionContext = {
  gen: { provider: "glm", temperature: 0.5, maxTokens: 4096 } as any,
  campaign: { premise: "Modern Tokyo", ipContext: null, premiseDivergence: null },
  settings: { research: { enabled: true, provider: "brave", braveApiKey: "x" } } as any,
  locationNames: ["Jujutsu High"],
  factionNames: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingestCharacterDraft", () => {
  it("end-to-end runs all stages for parse mode and returns powerStats", async () => {
    const input: IngestionInput = {
      mode: "parse",
      campaignId: "c1",
      role: "player",
      freeText: "a haunted clockmaker",
    };
    const out = await ingestCharacterDraft(input, baseCtx);
    expect(out.powerStats).toBeDefined();
    expect(out.powerStats!.attackPotency.tier).toBe("Universal");
    expect(synthesizeDraftFromSources).toHaveBeenCalledTimes(1);
    expect(assessPowerStats).toHaveBeenCalledTimes(1);
  });

  it("runs archetype research only in research mode", async () => {
    await ingestCharacterDraft(
      { mode: "research", campaignId: "c1", role: "player", archetype: "paladin" },
      baseCtx,
    );
    expect(researchArchetype).toHaveBeenCalledTimes(1);
  });

  it("does NOT run archetype research in parse mode", async () => {
    await ingestCharacterDraft(
      { mode: "parse", campaignId: "c1", role: "player", freeText: "x" },
      baseCtx,
    );
    expect(researchArchetype).not.toHaveBeenCalled();
  });

  it("does NOT run archetype research in import mode", async () => {
    await ingestCharacterDraft(
      { mode: "import", campaignId: "c1", role: "player", v2Card: gojoCard as any },
      baseCtx,
    );
    expect(researchArchetype).not.toHaveBeenCalled();
  });

  it("threads overrideText from input through synthesis stage", async () => {
    const input: IngestionInput = {
      mode: "parse",
      campaignId: "c1",
      role: "player",
      freeText: "x",
      overrideText: "she is blind",
    };
    const out = await ingestCharacterDraft(input, baseCtx);
    expect((out.provenance as any).overrideText).toBe("she is blind");
  });

  it("skips research when settings.research.enabled is false", async () => {
    await ingestCharacterDraft(
      { mode: "research", campaignId: "c1", role: "player", archetype: "paladin" },
      { ...baseCtx, settings: { research: { enabled: false } } as any },
    );
    expect(researchArchetype).not.toHaveBeenCalled();
  });

  it("throws IngestionPipelineError when powerStats missing after pipeline", async () => {
    (assessPowerStats as any).mockResolvedValueOnce({ ...mockDraft, powerStats: undefined });
    await expect(
      ingestCharacterDraft(
        { mode: "parse", campaignId: "c1", role: "player", freeText: "x" },
        baseCtx,
      ),
    ).rejects.toThrow(/powerStats is undefined/);
  });

  it("runs for key role same as player role", async () => {
    const out = await ingestCharacterDraft(
      {
        mode: "import",
        campaignId: "c1",
        role: "key",
        v2Card: gojoCard as any,
        overrideText: "weaker than canon",
      },
      baseCtx,
    );
    expect(out.powerStats).toBeDefined();
  });
});
