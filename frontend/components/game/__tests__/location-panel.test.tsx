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
  connectedLocations: [] as Array<{ id: string; name: string }>,
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
    const connectedLocations = [
      { id: "loc2", name: "Dark Alley" },
      { id: "loc3", name: "Castle Gate" },
    ];
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        connectedLocations={connectedLocations}
        onMove={onMove}
      />
    );
    const alleyButton = screen.getByRole("button", { name: "Dark Alley" });
    await userEvent.click(alleyButton);
    expect(onMove).toHaveBeenCalledWith("Dark Alley");
  });

  it("disables path buttons when disabled is true", () => {
    const connectedLocations = [{ id: "loc2", name: "Dark Alley" }];
    render(
      <LocationPanel
        {...defaultProps}
        location={makeLocation()}
        connectedLocations={connectedLocations}
        disabled={true}
      />
    );
    const button = screen.getByRole("button", { name: "Dark Alley" });
    expect(button).toBeDisabled();
  });
});
