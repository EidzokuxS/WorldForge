import { describe, expect, it } from "vitest";
import type { CombatEnvelope } from "../combat-envelope.js";
import { buildNarrativeOutcomeBounds } from "../combat-envelope.js";

function createEnvelope(overrides: Partial<CombatEnvelope> = {}): CombatEnvelope {
  return {
    matchup: "contested",
    durabilityTierGap: 0,
    durabilityStepGap: 0,
    speedTierGap: 0,
    speedStepGap: 0,
    intelligenceTierGap: 0,
    intelligenceStepGap: 0,
    actorBypassesTarget: false,
    targetBypassesActor: false,
    actorBypassSources: [],
    targetBypassSources: [],
    relevantVulnerabilities: [],
    summaryLines: ["Matchup: contested."],
    ...overrides,
  };
}

describe("buildNarrativeOutcomeBounds", () => {
  it("derives dominant strong-hit bounds without widening into hard combat math", () => {
    const bounds = buildNarrativeOutcomeBounds(
      createEnvelope({ matchup: "dominant" }),
      "strong_hit",
    );

    expect(bounds.summary).toContain("dominant strong hit");
    expect(bounds.ceilings.length).toBeGreaterThan(0);
    expect(bounds.ceilings.length).toBeLessThanOrEqual(3);
    expect(bounds.floors).toContain(
      "The actor's superiority is visible on the page.",
    );
    expect(bounds.prohibitions).toContain(
      "A sudden reversal into target dominance is outside this envelope.",
    );
  });

  it("keeps contested weak-hit bounds localized instead of decisive", () => {
    const bounds = buildNarrativeOutcomeBounds(
      createEnvelope({ matchup: "contested" }),
      "weak_hit",
    );

    expect(bounds.summary).toContain("contested weak hit");
    expect(bounds.ceilings).toContain(
      "The beat can win a glancing exchange, force movement, or expose a weakness.",
    );
    expect(bounds.prohibitions).toContain(
      "A decisive rout is outside this beat.",
    );
  });

  it("keeps outmatched miss bounds survival-oriented", () => {
    const bounds = buildNarrativeOutcomeBounds(
      createEnvelope({ matchup: "outmatched" }),
      "miss",
    );

    expect(bounds.summary).toContain("outmatched miss");
    expect(bounds.ceilings).toContain(
      "The miss can trigger severe punishment, hard separation, or crisis management.",
    );
    expect(bounds.floors).toContain(
      "The weaker side is now surviving, not dictating pace.",
    );
  });

  it("surfaces vulnerability-aware ceiling facts while keeping lists bounded", () => {
    const bounds = buildNarrativeOutcomeBounds(
      createEnvelope({
        matchup: "disadvantaged",
        relevantVulnerabilities: [
          {
            description: "Barrier anchors fold under sustained resonance pressure.",
            severity: "major",
          },
        ],
      }),
      "strong_hit",
    );

    expect(bounds.ceilings.some((line) => line.includes("listed target vulnerability"))).toBe(true);
    expect(bounds.ceilings.length).toBeLessThanOrEqual(3);
    expect(bounds.floors.length).toBeLessThanOrEqual(3);
    expect(bounds.prohibitions.length).toBeLessThanOrEqual(3);
  });

  it("returns a deterministic unknown-outcome fallback instead of failing open", () => {
    const bounds = buildNarrativeOutcomeBounds(
      createEnvelope({ matchup: "advantaged" }),
      "glancing_hit",
    );

    expect(bounds.summary).toContain("unknown outcome");
    expect(bounds.ceilings).toEqual([
      "The beat can move the scene locally without resolving the whole conflict.",
    ]);
    expect(bounds.prohibitions).toEqual([
      "An unexplained total reversal is outside this envelope.",
    ]);
  });

  it("keeps guidance phrased as constraint facts rather than imperative do-not lines", () => {
    const bounds = buildNarrativeOutcomeBounds(
      createEnvelope({ matchup: "dominant" }),
      "weak_hit",
    );

    const serialized = JSON.stringify(bounds);
    expect(serialized).not.toContain("Do not");
  });
});
