import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPanel } from "../location-panel";

const makeLocation = (overrides = {}) => ({
  id: "loc1",
  name: "Town Square",
  description: "A bustling marketplace at the heart of the city.",
  tags: ["urban", "safe"],
  ...overrides,
});

const defaultProps = {
  location: null,
  connectedPaths: [] as Array<{
    id: string;
    name: string;
    pathSummary?: string | null;
    travelCost?: number | null;
  }>,
  npcsHere: [] as Array<{ id: string; name: string; tier: string }>,
  itemsHere: [] as Array<{ id: string; name: string }>,
  onMove: vi.fn(),
  disabled: false,
};

describe("LocationPanel", () => {
  it("shows 'No location loaded' when location is null", () => {
    render(<LocationPanel {...defaultProps} />);
    expect(screen.getByText("No location loaded")).toBeInTheDocument();
  });

  it("renders location name and description", () => {
    render(<LocationPanel {...defaultProps} location={makeLocation()} />);
    expect(screen.getByText("Town Square")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A bustling marketplace at the heart of the city."
      )
    ).toBeInTheDocument();
  });

  it("renders location tags", () => {
    render(<LocationPanel {...defaultProps} location={makeLocation()} />);
    expect(screen.getByText("urban")).toBeInTheDocument();
    expect(screen.getByText("safe")).toBeInTheDocument();
  });

  it("renders NPCs present at location", () => {
    const npcsHere = [
      { id: "n1", name: "Merchant Galen", tier: "key" },
      { id: "n2", name: "Wandering Bard", tier: "temporary" },
    ];
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        npcsHere={npcsHere}
      />
    );
    expect(screen.getByText(/Merchant Galen/)).toBeInTheDocument();
    expect(screen.getByText(/Wandering Bard/)).toBeInTheDocument();
    expect(screen.getByText("(passing)")).toBeInTheDocument();
  });

  it("renders People Here from encounter scope rather than everyone in the same broad location", () => {
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        npcsHere={[
          { id: "n1", name: "Nobara Kugisaki", tier: "key", encounterScope: "present" },
          { id: "n2", name: "Satoru Gojo", tier: "key", encounterScope: "same broad location only" },
        ] as Array<{ id: string; name: string; tier: string }>}
      />
    );

    expect(screen.getByText("People Here")).toBeInTheDocument();
    expect(screen.getByText(/Nobara Kugisaki/)).toBeInTheDocument();
    expect(screen.queryByText(/Satoru Gojo/)).not.toBeInTheDocument();
  });

  it("renders items at location", () => {
    const itemsHere = [{ id: "it1", name: "Rusty Key" }];
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        itemsHere={itemsHere}
      />
    );
    expect(screen.getByText(/Rusty Key/)).toBeInTheDocument();
  });

  it("renders connected locations as clickable paths", async () => {
    const onMove = vi.fn();
    const connectedPaths = [
      { id: "loc2", name: "Dark Alley", travelCost: 2, pathSummary: "via the lantern market" },
      { id: "loc3", name: "Castle Gate", travelCost: 1 },
    ];
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        connectedPaths={connectedPaths}
        onMove={onMove}
      />
    );
    const alleyButton = screen.getByRole("button", { name: "Dark Alley" });
    await userEvent.click(alleyButton);
    expect(onMove).toHaveBeenCalledWith("Dark Alley");
    expect(screen.getByText("2 ticks")).toBeInTheDocument();
    expect(screen.getByText("via the lantern market")).toBeInTheDocument();
  });

  it("disables path buttons when disabled is true", () => {
    const connectedPaths = [{ id: "loc2", name: "Dark Alley", travelCost: 1 }];
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        connectedPaths={connectedPaths}
        disabled={true}
      />
    );
    const button = screen.getByRole("button", { name: "Dark Alley" });
    expect(button).toBeDisabled();
  });

  it("renders recent happenings for the current location", () => {
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation({
          recentHappenings: [
            {
              id: "event-1",
              summary: "A rooftop duel scattered cursed ash across the square.",
              tick: 12,
              eventType: "ephemeral_scene",
            },
          ],
        })}
      />
    );

    expect(screen.getByText("Recent Happenings")).toBeInTheDocument();
    expect(
      screen.getByText("A rooftop duel scattered cursed ash across the square.")
    ).toBeInTheDocument();
    expect(screen.getByText("Tick 12")).toBeInTheDocument();
  });

  it("renders an explicit empty state when no recent happenings are recorded", () => {
    render(<LocationPanel {...defaultProps} location={makeLocation({ recentHappenings: [] })} />);

    expect(screen.getByText("Recent Happenings")).toBeInTheDocument();
    expect(
      screen.getByText("No recent happenings recorded here yet.")
    ).toBeInTheDocument();
  });
});
