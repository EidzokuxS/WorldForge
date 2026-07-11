import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { ActorsSection } from "./actors-section";
import { campaignWorldReviewFixture } from "./world-review.test-support";

describe("ActorsSection", () => {
  it("renders a collective through the ordinary actor contract and keeps ID navigation", () => {
    const world = campaignWorldReviewFixture();
    const selectActor = vi.fn();
    const selectLocation = vi.fn();
    render(
      <ActorsSection
        actors={world.actors}
        goals={world.goals}
        placements={world.placements}
        relations={world.relations}
        locations={world.locations}
        selectedActorId="actor-b"
        onSelectActor={selectActor}
        onSelectLocation={selectLocation}
      />,
    );

    const details = screen.getByLabelText("The Signal Guild details");
    expect(screen.queryByRole("heading", { name: "player actors" })).not.toBeInTheDocument();
    expect(details).toHaveTextContent("collective · agent");
    expect(details).toHaveTextContent("Preserve authority over the signal network.");
    fireEvent.click(within(details).getByRole("button", { name: "base · Bell Platform" }));
    expect(selectLocation).toHaveBeenCalledWith("location-b");
    fireEvent.click(within(details).getByRole("button", { name: "Mara Venn" }));
    expect(selectActor).toHaveBeenCalledWith("actor-a");
  });
});
