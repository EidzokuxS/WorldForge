import { describe, it, expect } from "vitest";
import {
  compareTiers,
  tierDistance,
  canHaxBypass,
  formatTierRank,
  normalizeApDurTier,
  normalizeSpeedTier,
  normalizeIntelligenceTier,
  AP_DURABILITY_TIERS,
  SPEED_TIERS,
  INTELLIGENCE_TIERS,
} from "../power-tiers.js";
import type { TierRank, ApDurabilityTier, SpeedTier, HaxAbility } from "../types.js";

describe("compareTiers", () => {
  it("returns negative when first tier is lower", () => {
    const a: TierRank<ApDurabilityTier> = { tier: "Human", rank: 5 };
    const b: TierRank<ApDurabilityTier> = { tier: "City", rank: 5 };
    expect(compareTiers(AP_DURABILITY_TIERS, a, b)).toBeLessThan(0);
  });

  it("returns positive when first tier is higher", () => {
    const a: TierRank<ApDurabilityTier> = { tier: "Planet", rank: 3 };
    const b: TierRank<ApDurabilityTier> = { tier: "Mountain", rank: 8 };
    expect(compareTiers(AP_DURABILITY_TIERS, a, b)).toBeGreaterThan(0);
  });

  it("compares by rank when tiers are equal", () => {
    const a: TierRank<ApDurabilityTier> = { tier: "City", rank: 8 };
    const b: TierRank<ApDurabilityTier> = { tier: "City", rank: 3 };
    expect(compareTiers(AP_DURABILITY_TIERS, a, b)).toBe(5);
  });

  it("returns 0 for identical tier+rank", () => {
    const a: TierRank<SpeedTier> = { tier: "FTL", rank: 5 };
    expect(compareTiers(SPEED_TIERS, a, a)).toBe(0);
  });
});

describe("tierDistance", () => {
  it("calculates cross-tier distance", () => {
    const a: TierRank<ApDurabilityTier> = { tier: "City", rank: 7 };
    const b: TierRank<ApDurabilityTier> = { tier: "Building", rank: 5 };
    const result = tierDistance(AP_DURABILITY_TIERS, a, b);
    // City is index 6, Building is index 3 -> tierDiff = 3
    expect(result.tiers).toBe(3);
    // total = 3*10 + (7-5) = 32
    expect(result.total).toBe(32);
  });

  it("returns zero distance for same position", () => {
    const a: TierRank<SpeedTier> = { tier: "Supersonic", rank: 5 };
    const result = tierDistance(SPEED_TIERS, a, a);
    expect(result.tiers).toBe(0);
    expect(result.total).toBe(0);
  });

  it("returns negative distance when first is lower", () => {
    const a: TierRank<ApDurabilityTier> = { tier: "Wall", rank: 3 };
    const b: TierRank<ApDurabilityTier> = { tier: "Mountain", rank: 1 };
    const result = tierDistance(AP_DURABILITY_TIERS, a, b);
    expect(result.tiers).toBeLessThan(0);
    expect(result.total).toBeLessThan(0);
  });
});

describe("canHaxBypass", () => {
  it("returns true when bypass tier >= target tier", () => {
    const hax: HaxAbility = {
      name: "Infinity",
      type: "Spatial Manipulation",
      bypassTier: "Universal",
      limitations: [],
    };
    const target: TierRank<ApDurabilityTier> = { tier: "Planet", rank: 5 };
    expect(canHaxBypass(hax, target)).toBe(true);
  });

  it("returns false when bypass tier < target tier", () => {
    const hax: HaxAbility = {
      name: "Fireball",
      type: "Fire",
      bypassTier: "Building",
      limitations: [],
    };
    const target: TierRank<ApDurabilityTier> = { tier: "Mountain", rank: 1 };
    expect(canHaxBypass(hax, target)).toBe(false);
  });

  it("returns false when bypassTier is null", () => {
    const hax: HaxAbility = {
      name: "Punch",
      type: "Physical",
      bypassTier: null,
      limitations: [],
    };
    const target: TierRank<ApDurabilityTier> = { tier: "Human", rank: 1 };
    expect(canHaxBypass(hax, target)).toBe(false);
  });

  it("returns true when bypass tier equals target tier", () => {
    const hax: HaxAbility = {
      name: "Crush",
      type: "Physical",
      bypassTier: "City",
      limitations: [],
    };
    const target: TierRank<ApDurabilityTier> = { tier: "City", rank: 10 };
    expect(canHaxBypass(hax, target)).toBe(true);
  });
});

describe("formatTierRank", () => {
  it("formats tier and rank with space", () => {
    expect(formatTierRank({ tier: "City", rank: 7 })).toBe("City 7");
  });

  it("handles multi-word tier names", () => {
    expect(formatTierRank({ tier: "City Block", rank: 3 })).toBe("City Block 3");
  });
});

describe("normalizeApDurTier", () => {
  it("returns exact match unchanged", () => {
    expect(normalizeApDurTier("City")).toBe("City");
  });

  it("normalizes case-insensitive exact match", () => {
    expect(normalizeApDurTier("city")).toBe("City");
    expect(normalizeApDurTier("CITY")).toBe("City");
  });

  it("normalizes 'city level' alias", () => {
    expect(normalizeApDurTier("city level")).toBe("City");
    expect(normalizeApDurTier("City Level")).toBe("City");
  });

  it("normalizes 'planetary' to 'Planet'", () => {
    expect(normalizeApDurTier("planetary")).toBe("Planet");
  });

  it("normalizes multi-word tiers", () => {
    expect(normalizeApDurTier("city block")).toBe("City Block");
    expect(normalizeApDurTier("solar system")).toBe("Solar System");
    expect(normalizeApDurTier("Solar System Level")).toBe("Solar System");
  });

  it("returns undefined for unknown values", () => {
    expect(normalizeApDurTier("Cosmic Level")).toBeUndefined();
    expect(normalizeApDurTier("Ultra Powerful")).toBeUndefined();
  });
});

describe("normalizeSpeedTier", () => {
  it("normalizes MHS+ to Massively Hypersonic", () => {
    expect(normalizeSpeedTier("MHS+")).toBe("Massively Hypersonic");
    expect(normalizeSpeedTier("mhs")).toBe("Massively Hypersonic");
  });

  it("normalizes FTL+ to FTL", () => {
    expect(normalizeSpeedTier("FTL+")).toBe("FTL");
    expect(normalizeSpeedTier("faster than light")).toBe("FTL");
  });

  it("normalizes MFTL variants", () => {
    expect(normalizeSpeedTier("MFTL+")).toBe("MFTL");
    expect(normalizeSpeedTier("massively ftl+")).toBe("MFTL");
  });

  it("returns exact match", () => {
    expect(normalizeSpeedTier("Hypersonic")).toBe("Hypersonic");
  });

  it("returns undefined for unknown values", () => {
    expect(normalizeSpeedTier("Ultra Fast")).toBeUndefined();
    expect(normalizeSpeedTier("Warp Speed")).toBeUndefined();
  });
});

describe("normalizeIntelligenceTier", () => {
  it("normalizes 'super genius' to 'Supergenius'", () => {
    expect(normalizeIntelligenceTier("super genius")).toBe("Supergenius");
    expect(normalizeIntelligenceTier("super-genius")).toBe("Supergenius");
  });

  it("normalizes 'genius level' to 'Genius'", () => {
    expect(normalizeIntelligenceTier("genius level")).toBe("Genius");
  });

  it("normalizes case-insensitive exact match", () => {
    expect(normalizeIntelligenceTier("above average")).toBe("Above Average");
  });

  it("returns exact match", () => {
    expect(normalizeIntelligenceTier("Genius")).toBe("Genius");
  });

  it("returns undefined for unknown values", () => {
    expect(normalizeIntelligenceTier("Omniscient")).toBeUndefined();
  });
});
