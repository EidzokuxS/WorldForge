import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { OverviewSection } from "./overview-section";
import { campaignWorldReviewFixture } from "./world-review.test-support";

describe("OverviewSection", () => {
  it("shows persisted totals, provenance, and section navigation", () => {
    const openLocations = vi.fn();
    const openActors = vi.fn();
    const openConnections = vi.fn();
    render(
      <OverviewSection
        world={campaignWorldReviewFixture()}
        onOpenLocations={openLocations}
        onOpenActors={openActors}
        onOpenConnections={openConnections}
      />,
    );

    expect(screen.getByLabelText("World totals")).toHaveTextContent("2Locations1Routes1People1Collectives1Pressures");
    expect(screen.getByText("0123456789ab")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect Locations" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect Actors" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect Connections" }));
    expect(openLocations).toHaveBeenCalledOnce();
    expect(openActors).toHaveBeenCalledOnce();
    expect(openConnections).toHaveBeenCalledOnce();
  });
});
