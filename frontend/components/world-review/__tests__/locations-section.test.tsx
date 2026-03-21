import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocationsSection } from "../locations-section";
import type { ScaffoldLocation } from "@/lib/api-types";

vi.mock("../regenerate-dialog", () => ({
  RegenerateDialog: () => <button data-testid="regenerate">Regenerate</button>,
}));

vi.mock("../tag-editor", () => ({
  TagEditor: () => <div data-testid="tag-editor" />,
}));

const makeLocation = (overrides: Partial<ScaffoldLocation> = {}): ScaffoldLocation => ({
  name: "Tavern",
  description: "A cozy tavern",
  tags: ["safe"],
  isStarting: true,
  connectedTo: [],
  ...overrides,
});

describe("LocationsSection", () => {
  const defaults = {
    locations: [makeLocation(), makeLocation({ name: "Forest", description: "A dark forest", isStarting: false })],
    onChange: vi.fn(),
    onRegenerate: vi.fn(),
    regenerating: false,
  };

  it("renders location cards with names", () => {
    render(<LocationsSection {...defaults} />);
    expect(screen.getByDisplayValue("Tavern")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Forest")).toBeInTheDocument();
  });

  it("renders the Locations heading and Add Location button", () => {
    render(<LocationsSection {...defaults} />);
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("Add Location")).toBeInTheDocument();
  });

  it("calls onChange with a new location when Add Location is clicked", () => {
    const onChange = vi.fn();
    render(<LocationsSection {...defaults} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add Location"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newLocations = onChange.mock.calls[0][0];
    expect(newLocations).toHaveLength(3);
    expect(newLocations[2].name).toBe("");
  });
});
