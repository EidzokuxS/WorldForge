import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PowerStats } from "@worldforge/shared";
import { formatTierRank } from "@worldforge/shared";

import { PowerStatsSection } from "../power-stats-section";

const FIXTURE: PowerStats = {
  attackPotency: { tier: "Street", rank: 5 },
  speed: { tier: "Athlete", rank: 3 },
  durability: { tier: "Street", rank: 4 },
  intelligence: { tier: "Gifted", rank: 6 },
  hax: [
    {
      name: "Regeneration",
      type: "Healing",
      bypassTier: "Building",
      limitations: ["Limit: 3/day"],
    },
  ],
  vulnerabilities: [
    { severity: "critical", description: "Silver weapons" },
    { severity: "major", description: "Bright sunlight" },
    { severity: "minor", description: "Cold iron trinkets" },
  ],
};

describe("PowerStatsSection", () => {
  it("renders all 4 axes with formatted tier+rank ratings", () => {
    render(<PowerStatsSection powerStats={FIXTURE} />);
    expect(screen.getByText("Attack Potency")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Durability")).toBeInTheDocument();
    expect(screen.getByText("Intelligence")).toBeInTheDocument();

    expect(
      screen.getByText(formatTierRank(FIXTURE.attackPotency)),
    ).toBeInTheDocument();
    expect(screen.getByText(formatTierRank(FIXTURE.speed))).toBeInTheDocument();
  });

  it("renders hax name, type, bypass badge, and limitations", () => {
    render(<PowerStatsSection powerStats={FIXTURE} />);
    expect(screen.getByText("Regeneration")).toBeInTheDocument();
    expect(screen.getByText("Healing")).toBeInTheDocument();
    expect(screen.getByText("Bypasses Building")).toBeInTheDocument();
    expect(screen.getByText("Limit: 3/day")).toBeInTheDocument();
  });

  it("renders vulnerability rows with severity badges and descriptions", () => {
    render(<PowerStatsSection powerStats={FIXTURE} />);
    const criticalBadge = screen.getByText("critical");
    expect(criticalBadge).toHaveClass("text-red-300");
    expect(screen.getByText("Silver weapons")).toBeInTheDocument();
    expect(screen.getByText("major")).toHaveClass("text-amber-300");
    expect(screen.getByText("minor")).toHaveClass("text-zinc-300");
  });

  it("returns null when powerStats is undefined (no placeholder)", () => {
    const { container } = render(<PowerStatsSection powerStats={undefined} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/no power assessment/i)).toBeNull();
    expect(screen.queryByText(/not assessed/i)).toBeNull();
  });

  it("renders the Power Stats microcopy label with design tokens", () => {
    render(<PowerStatsSection powerStats={FIXTURE} />);
    const label = screen.getByText("Power Stats");
    expect(label).toHaveClass("font-mono");
    expect(label).toHaveClass("uppercase");
    expect(label).toHaveClass("tracking-[0.1em]");
    expect(label).toHaveClass("text-zinc-500");
  });

  it("applies aria-label Power stats on the outer wrapper", () => {
    render(<PowerStatsSection powerStats={FIXTURE} />);
    expect(screen.getByLabelText("Power stats")).toBeInTheDocument();
  });
});
