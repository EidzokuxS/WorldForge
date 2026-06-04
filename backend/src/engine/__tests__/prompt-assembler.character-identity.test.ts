import { describe, it, expect } from "vitest";
import type { PowerStats } from "@worldforge/shared";
import { buildPowerStatsLine } from "../prompt-assembler.js";

// -- Test fixtures ------------------------------------------------------------

function makePowerStats(overrides: Partial<PowerStats> = {}): PowerStats {
  return {
    attackPotency: { tier: "City", rank: 7 },
    speed: { tier: "Massively Hypersonic", rank: 5 },
    durability: { tier: "City", rank: 5 },
    intelligence: { tier: "Genius", rank: 3 },
    hax: [],
    vulnerabilities: [],
    ...overrides,
  };
}

// -- buildPowerStatsLine tests ------------------------------------------------

describe("buildPowerStatsLine", () => {
  it("returns null when powerStats is undefined", () => {
    const result = buildPowerStatsLine({ powerStats: undefined });
    expect(result).toBeNull();
  });

  it("returns null when powerStats is not present on record", () => {
    const result = buildPowerStatsLine({});
    expect(result).toBeNull();
  });

  it("builds compact power stats line with all four axes", () => {
    const result = buildPowerStatsLine({ powerStats: makePowerStats() });

    expect(result).not.toBeNull();
    expect(result).toContain("Power:");
    expect(result).toContain("AP=City 7");
    expect(result).toContain("Speed=Massively Hypersonic 5");
    expect(result).toContain("Dur=City 5");
    expect(result).toContain("Int=Genius 3");
  });

  it("includes hax abilities when present", () => {
    const stats = makePowerStats({
      hax: [
        {
          name: "Infinity",
          type: "Spatial Manipulation",
          bypassTier: "Universal",
          limitations: ["Domain Expansion disables it"],
        },
      ],
    });
    const result = buildPowerStatsLine({ powerStats: stats });

    expect(result).toContain("Hax:");
    expect(result).toContain("Infinity");
    expect(result).toContain("Spatial Manipulation");
    expect(result).toContain("bypasses Universal");
    expect(result).toContain("Domain Expansion disables it");
  });

  it("includes vulnerabilities when present", () => {
    const stats = makePowerStats({
      vulnerabilities: [
        { description: "Weak to fire", severity: "major" },
        { description: "Allergic to silver", severity: "minor" },
      ],
    });
    const result = buildPowerStatsLine({ powerStats: stats });

    expect(result).toContain("Vulnerabilities:");
    expect(result).toContain("Weak to fire (major)");
    expect(result).toContain("Allergic to silver (minor)");
  });

  it("omits hax section when hax array is empty", () => {
    const result = buildPowerStatsLine({ powerStats: makePowerStats() });
    expect(result).not.toContain("Hax:");
  });

  it("omits vulnerabilities section when vulnerabilities array is empty", () => {
    const result = buildPowerStatsLine({ powerStats: makePowerStats() });
    expect(result).not.toContain("Vulnerabilities:");
  });

  it("does not contain continuity or grounding references", () => {
    const result = buildPowerStatsLine({ powerStats: makePowerStats() });
    expect(result).not.toContain("continuity");
    expect(result).not.toContain("grounding");
    expect(result).not.toContain("protectedCore");
    expect(result).not.toContain("mutableSurface");
    expect(result).not.toContain("identityInertia");
  });
});
