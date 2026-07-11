import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { ConnectionsSection } from "./connections-section";
import { campaignWorldReviewFixture } from "./world-review.test-support";

describe("ConnectionsSection", () => {
  it("shows directed relations and pressure anchors with persisted IDs", () => {
    const world = campaignWorldReviewFixture();
    const selectActor = vi.fn();
    const selectLocation = vi.fn();
    render(
      <ConnectionsSection
        actors={world.actors}
        locations={world.locations}
        relations={world.relations}
        pressures={world.pressures}
        onSelectActor={selectActor}
        onSelectLocation={selectLocation}
      />,
    );

    expect(screen.getByText("Intensity 4 of 5")).toBeInTheDocument();
    const pressure = screen.getByRole("heading", { name: "Closing Route" }).closest("article");
    expect(pressure).toHaveAttribute("data-urgency", "high");
    fireEvent.click(within(pressure!).getByRole("button", { name: "The Signal Guild" }));
    fireEvent.click(within(pressure!).getByRole("button", { name: "Bell Platform" }));
    expect(selectActor).toHaveBeenCalledWith("actor-b");
    expect(selectLocation).toHaveBeenCalledWith("location-b");
  });
});
