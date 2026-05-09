import { describe, expect, it } from "vitest";
import type { PowerStats } from "@worldforge/shared";
import {
  buildCombatEnvelope,
  isCombatPressureAction,
  isHostileCombatAction,
} from "../combat-envelope.js";

function createPowerStats(overrides: Partial<PowerStats> = {}): PowerStats {
  return {
    attackPotency: { tier: "Building", rank: 5 },
    speed: { tier: "Subsonic", rank: 5 },
    durability: { tier: "Building", rank: 5 },
    intelligence: { tier: "Gifted", rank: 5 },
    hax: [],
    vulnerabilities: [],
    ...overrides,
  };
}

describe("isHostileCombatAction", () => {
  it("classifies direct attack verbs as hostile combat", () => {
    expect(
      isHostileCombatAction({
        actionText: "Strike the ogre with a spear",
      }),
    ).toBe(true);
  });

  it("does not classify ordinary social or utility actions as combat", () => {
    expect(
      isHostileCombatAction({
        actionText: "Inspect the old relay tower",
        intent: "Inspect the old relay tower",
      }),
    ).toBe(false);
    expect(
      isHostileCombatAction({
        actionText: "Talk the guard into opening the gate",
      }),
    ).toBe(false);
  });
});

describe("isCombatPressureAction", () => {
  it("classifies defensive, probing, aftermath, and power-gap actions as combat pressure", () => {
    expect(
      isCombatPressureAction({
        actionText: "I take a defensive posture and test the gap between us.",
      }),
    ).toBe(true);
    expect(
      isCombatPressureAction({
        actionText: "What changed because of the violence after that strike?",
      }),
    ).toBe(true);
    expect(
      isCombatPressureAction({
        actionText: "I ask how strong the curse is before making a risky move.",
      }),
    ).toBe(true);
  });

  it("does not classify ordinary tourism or shopping as combat pressure", () => {
    expect(
      isCombatPressureAction({
        actionText: "I ask the cafe clerk how much the ice cream costs.",
      }),
    ).toBe(false);
  });
});

describe("buildCombatEnvelope", () => {
  it("returns a non-null envelope for a hostile stronger-vs-weaker matchup", () => {
    const envelope = buildCombatEnvelope({
      actor: {
        label: "Gojo",
        powerStats: createPowerStats({
          attackPotency: { tier: "City", rank: 7 },
          speed: { tier: "Hypersonic", rank: 8 },
          intelligence: { tier: "Genius", rank: 7 },
        }),
      },
      target: {
        label: "Curse",
        powerStats: createPowerStats({
          durability: { tier: "Building", rank: 5 },
          speed: { tier: "Subsonic", rank: 4 },
        }),
      },
      hostileAction: true,
      actionText: "Strike the curse with Hollow Purple",
    });

    expect(envelope).not.toBeNull();
    expect(envelope?.matchup).toMatch(/dominant|advantaged/);
    expect(envelope?.summaryLines.join("\n")).toContain("Matchup:");
    expect(envelope?.summaryLines.join("\n")).toContain("overmatches");
  });

  it("surfaces a large no-bypass durability gap explicitly", () => {
    const envelope = buildCombatEnvelope({
      actor: {
        label: "Panda",
        powerStats: createPowerStats({
          attackPotency: { tier: "Building", rank: 5 },
        }),
      },
      target: {
        label: "Mahoraga",
        powerStats: createPowerStats({
          durability: { tier: "Mountain", rank: 7 },
        }),
      },
      hostileAction: true,
      actionText: "Punch Mahoraga",
    });

    expect(envelope).not.toBeNull();
    expect(envelope?.durabilityTierGap).toBeGreaterThanOrEqual(2);
    expect(envelope?.actorBypassesTarget).toBe(false);
    expect(envelope?.summaryLines.join("\n")).toContain("tiers above");
  });

  it("surfaces actor bypass against target durability", () => {
    const envelope = buildCombatEnvelope({
      actor: {
        label: "Sukuna",
        powerStats: createPowerStats({
          hax: [
            {
              name: "World Slash",
              type: "Spatial Manipulation",
              bypassTier: "Country",
              limitations: [],
            },
          ],
        }),
      },
      target: {
        label: "Gojo",
        powerStats: createPowerStats({
          durability: { tier: "Mountain", rank: 9 },
        }),
      },
      hostileAction: true,
      actionText: "Slash through Infinity with World Slash",
    });

    expect(envelope?.actorBypassesTarget).toBe(true);
    expect(envelope?.actorBypassSources).toContain("World Slash");
    expect(envelope?.summaryLines.join("\n")).toContain("can bypass");
  });

  it("surfaces matched target vulnerabilities", () => {
    const envelope = buildCombatEnvelope({
      actor: {
        label: "Seal Team",
        powerStats: createPowerStats({
          hax: [
            {
              name: "Sealing Array",
              type: "Sealing Technique",
              bypassTier: null,
              limitations: [],
            },
          ],
        }),
      },
      target: {
        label: "Threat",
        powerStats: createPowerStats({
          vulnerabilities: [
            {
              description: "Highly vulnerable to sealing techniques and barrier anchors.",
              severity: "critical",
            },
          ],
        }),
      },
      hostileAction: true,
      actionText: "Seal the threat inside a barrier array",
    });

    expect(envelope?.relevantVulnerabilities).toEqual([
      {
        description: "Highly vulnerable to sealing techniques and barrier anchors.",
        severity: "critical",
      },
    ]);
    expect(envelope?.summaryLines.join("\n")).toContain("Relevant target vulnerabilities");
  });

  it("returns null when combat data is missing", () => {
    const envelope = buildCombatEnvelope({
      actor: { label: "Actor", powerStats: undefined },
      target: { label: "Target", powerStats: createPowerStats() },
      hostileAction: true,
      actionText: "Attack the target",
    });

    expect(envelope).toBeNull();
  });

  it("returns null for non-hostile interactions even when power data exists", () => {
    const envelope = buildCombatEnvelope({
      actor: { label: "Actor", powerStats: createPowerStats() },
      target: { label: "Target", powerStats: createPowerStats() },
      hostileAction: false,
      actionText: "Negotiate terms",
    });

    expect(envelope).toBeNull();
  });
});
