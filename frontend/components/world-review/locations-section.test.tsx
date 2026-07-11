import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { LocationsSection } from "./locations-section";
import { campaignWorldReviewFixture } from "./world-review.test-support";

describe("LocationsSection", () => {
  it("navigates a directed route by its persisted destination ID", () => {
    const world = campaignWorldReviewFixture();
    const selectLocation = vi.fn();
    render(
      <LocationsSection
        locations={world.locations}
        routes={world.routes}
        selectedLocationId="location-a"
        onSelectLocation={selectLocation}
      />,
    );

    expect(screen.getByLabelText("Lantern Gate routes")).toHaveTextContent("travel cost 2");
    fireEvent.click(screen.getByRole("button", { name: "Route to Bell Platform, travel cost 2" }));
    expect(selectLocation).toHaveBeenCalledWith("location-b");
  });
});
