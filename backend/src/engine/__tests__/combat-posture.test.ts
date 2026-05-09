import { describe, expect, it } from "vitest";
import type { CombatEnvelope } from "../combat-envelope.js";
import { deriveCombatPosture } from "../combat-envelope.js";

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

describe("deriveCombatPosture", () => {
  it("locks the exact six-value combat posture contract", () => {
    const cases = [
      { expected: "aggress", envelope: createEnvelope({ matchup: "dominant" }) },
      {
        expected: "press",
        envelope: createEnvelope({ matchup: "advantaged" }),
      },
      {
        expected: "trade",
        envelope: createEnvelope({ matchup: "contested", targetBypassesActor: true }),
      },
      {
        expected: "probe",
        envelope: createEnvelope({
          matchup: "disadvantaged",
          relevantVulnerabilities: [
            { description: "Brief opening on cursed-speech recovery.", severity: "major" },
          ],
        }),
      },
      {
        expected: "withdraw",
        envelope: createEnvelope({
          matchup: "outmatched",
          actorBypassesTarget: true,
        }),
      },
      {
        expected: "disengage",
        envelope: createEnvelope({ matchup: "outmatched" }),
      },
    ] as const;

    expect(
      cases.map(({ expected, envelope }) =>
        deriveCombatPosture(envelope, { vsLabel: "Target" }).posture === expected,
      ),
    ).toEqual([true, true, true, true, true, true]);
  });

  it("builds bounded guidance and must-avoid lists with live target vulnerability context", () => {
    const posture = deriveCombatPosture(
      createEnvelope({
        matchup: "advantaged",
      }),
      { vsLabel: "Target" },
    );

    expect(posture.guidanceLines.length).toBeLessThanOrEqual(3);
    expect(posture.mustAvoid.length).toBeLessThanOrEqual(3);
  });

  it("surfaces must-avoid facts when the target is faster, tougher, and can bypass back", () => {
    const posture = deriveCombatPosture(
      createEnvelope({
        matchup: "outmatched",
        durabilityTierGap: 3,
        speedTierGap: -1,
        targetBypassesActor: true,
      }),
      { vsLabel: "Mahoraga" },
    );

    expect(posture.posture).toBe("disengage");
    expect(posture.mustAvoid).toEqual([
      "A frontal force race is losing business here.",
      "A stationary exchange leaves the actor open to target hax.",
      "Slow open-range setup gives the faster side first say.",
    ]);
    expect(posture.canWin).toBe(false);
  });

  it("caps exposed target vulnerabilities and guidance while keeping facts non-imperative", () => {
    const posture = deriveCombatPosture(
      createEnvelope({
        matchup: "disadvantaged",
        relevantVulnerabilities: [
          { description: "Barrier anchor flickers during domain resets.", severity: "major" },
          { description: "Soul guard slips when cursed output spikes too fast.", severity: "critical" },
          { description: "Third fact should be capped away.", severity: "minor" },
        ],
      }),
      { vsLabel: "Threat" },
    );

    expect(posture.exposedTargetVulnerabilities).toHaveLength(2);
    expect(posture.guidanceLines.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(posture)).not.toContain("Do not");
  });
});
