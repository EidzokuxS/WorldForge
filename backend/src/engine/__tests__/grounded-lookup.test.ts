import { describe, it, expect } from "vitest";
import type { PowerStats } from "@worldforge/shared";
import {
  lookupCharacterPower,
  compareCharacterPower,
} from "../grounded-lookup.js";

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

const GOJO_STATS: PowerStats = {
  attackPotency: { tier: "Universal", rank: 3 },
  speed: { tier: "MFTL", rank: 2 },
  durability: { tier: "Universal", rank: 5 },
  intelligence: { tier: "Extraordinary Genius", rank: 4 },
  hax: [
    {
      name: "Infinity",
      type: "Spatial Manipulation",
      bypassTier: "Universal",
      limitations: ["Domain Expansion disables it", "requires concentration"],
    },
  ],
  vulnerabilities: [
    { description: "Domain Expansion counters Infinity", severity: "critical" },
  ],
};

const NARUTO_STATS: PowerStats = {
  attackPotency: { tier: "Continental", rank: 8 },
  speed: { tier: "FTL", rank: 5 },
  durability: { tier: "Continental", rank: 6 },
  intelligence: { tier: "Above Average", rank: 7 },
  hax: [
    {
      name: "Sage Mode Sensing",
      type: "Enhanced Perception",
      bypassTier: null,
      limitations: ["requires nature energy"],
    },
  ],
  vulnerabilities: [],
};

// -- lookupCharacterPower tests -----------------------------------------------

describe("lookupCharacterPower", () => {
  it("returns formatted tier+rank for character with powerStats", () => {
    const result = lookupCharacterPower("Gojo Satoru", GOJO_STATS);

    expect(result.hasData).toBe(true);
    expect(result.answer).toContain("AP=Universal 3");
    expect(result.answer).toContain("Speed=MFTL 2");
    expect(result.answer).toContain("Dur=Universal 5");
    expect(result.answer).toContain("Int=Extraordinary Genius 4");
  });

  it("includes hax abilities in output", () => {
    const result = lookupCharacterPower("Gojo Satoru", GOJO_STATS);

    expect(result.answer).toContain("Infinity");
    expect(result.answer).toContain("Spatial Manipulation");
    expect(result.answer).toContain("bypasses Universal");
    expect(result.answer).toContain("Domain Expansion disables it");
  });

  it("includes vulnerabilities in output", () => {
    const result = lookupCharacterPower("Gojo Satoru", GOJO_STATS);

    expect(result.answer).toContain("Domain Expansion counters Infinity");
    expect(result.answer).toContain("critical");
  });

  it('returns "No stored power assessment" when powerStats is undefined', () => {
    const result = lookupCharacterPower("Random NPC", undefined);

    expect(result.hasData).toBe(false);
    expect(result.answer).toBe("No stored power assessment for Random NPC.");
  });

  it("handles character with empty hax and vulnerabilities", () => {
    const stats = makePowerStats();
    const result = lookupCharacterPower("Fighter", stats);

    expect(result.hasData).toBe(true);
    expect(result.answer).not.toContain("Hax:");
    expect(result.answer).not.toContain("Vulnerabilities:");
    expect(result.answer).toContain("AP=City 7");
  });
});

// -- compareCharacterPower tests ----------------------------------------------

describe("compareCharacterPower", () => {
  it("returns axis-by-axis comparison when both have data", () => {
    const result = compareCharacterPower(
      "Gojo",
      GOJO_STATS,
      "Naruto",
      NARUTO_STATS,
    );

    expect(result.hasCompleteData).toBe(true);
    expect(result.axisResults).toHaveLength(4);

    // Gojo has higher AP tier (Universal > Continental)
    const apResult = result.axisResults.find((r) => r.axis === "AP");
    expect(apResult?.result).toBe("A wins");

    // Gojo has higher Speed tier (MFTL > FTL)
    const speedResult = result.axisResults.find((r) => r.axis === "Speed");
    expect(speedResult?.result).toBe("A wins");

    // Gojo has higher Intelligence tier
    const intResult = result.axisResults.find((r) => r.axis === "Intelligence");
    expect(intResult?.result).toBe("A wins");
  });

  it("detects hax bypass in comparison", () => {
    const result = compareCharacterPower(
      "Gojo",
      GOJO_STATS,
      "Naruto",
      NARUTO_STATS,
    );

    // Gojo's Infinity bypasses Universal, Naruto's durability is Continental (lower)
    expect(result.bypasses.length).toBeGreaterThan(0);
    expect(result.bypasses[0]).toContain("Infinity");
    expect(result.bypasses[0]).toContain("bypasses");
  });

  it("handles tie on same tier and rank", () => {
    const statsA = makePowerStats({ speed: { tier: "Hypersonic", rank: 5 } });
    const statsB = makePowerStats({ speed: { tier: "Hypersonic", rank: 5 } });

    const result = compareCharacterPower("A", statsA, "B", statsB);
    const speedResult = result.axisResults.find((r) => r.axis === "Speed");
    expect(speedResult?.result).toBe("tie");
    expect(speedResult?.detail).toContain("Tied");
  });

  it("returns partial result when one character lacks powerStats", () => {
    const result = compareCharacterPower(
      "Gojo",
      GOJO_STATS,
      "Unknown",
      undefined,
    );

    expect(result.hasCompleteData).toBe(false);
    expect(result.answer).toContain("No stored power assessment for Unknown");
    expect(result.answer).toContain("Gojo");
    expect(result.axisResults).toHaveLength(0);
  });

  it("returns absence message when neither has powerStats", () => {
    const result = compareCharacterPower(
      "NPC A",
      undefined,
      "NPC B",
      undefined,
    );

    expect(result.hasCompleteData).toBe(false);
    expect(result.answer).toContain("No stored power assessment for NPC A or NPC B");
  });

  it("includes vulnerability notes in comparison answer", () => {
    const result = compareCharacterPower(
      "Gojo",
      GOJO_STATS,
      "Naruto",
      NARUTO_STATS,
    );

    expect(result.answer).toContain("Domain Expansion counters Infinity");
    expect(result.answer).toContain("critical");
  });

  it("detects when B's hax bypasses A's durability", () => {
    const strongHax: PowerStats = {
      ...makePowerStats(),
      hax: [
        {
          name: "Reality Warp",
          type: "Reality Manipulation",
          bypassTier: "Multiversal+",
          limitations: [],
        },
      ],
    };
    const defender = makePowerStats({ durability: { tier: "Planet", rank: 5 } });

    const result = compareCharacterPower("Warper", strongHax, "Tank", defender);

    const bBypass = result.bypasses.find((b) => b.includes("Reality Warp"));
    expect(bBypass).toBeDefined();
    expect(bBypass).toContain("bypasses Tank's durability");
  });
});
