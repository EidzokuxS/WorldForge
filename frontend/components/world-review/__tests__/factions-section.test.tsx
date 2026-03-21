import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FactionsSection } from "../factions-section";
import type { ScaffoldFaction } from "@/lib/api-types";

vi.mock("../regenerate-dialog", () => ({
  RegenerateDialog: () => <button data-testid="regenerate">Regenerate</button>,
}));

vi.mock("../tag-editor", () => ({
  TagEditor: () => <div data-testid="tag-editor" />,
}));

vi.mock("../string-list-editor", () => ({
  StringListEditor: ({ items }: { items: string[] }) => (
    <div data-testid="string-list-editor">{items.join(", ")}</div>
  ),
}));

const makeFaction = (overrides: Partial<ScaffoldFaction> = {}): ScaffoldFaction => ({
  name: "The Order",
  tags: ["holy"],
  goals: ["Protect the realm"],
  assets: ["Castle"],
  territoryNames: [],
  ...overrides,
});

describe("FactionsSection", () => {
  const defaults = {
    factions: [makeFaction(), makeFaction({ name: "Thieves Guild", tags: ["criminal"] })],
    locationNames: ["Tavern", "Forest"],
    onChange: vi.fn(),
    onRegenerate: vi.fn(),
    regenerating: false,
  };

  it("renders faction cards with names", () => {
    render(<FactionsSection {...defaults} />);
    expect(screen.getByDisplayValue("The Order")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Thieves Guild")).toBeInTheDocument();
  });

  it("renders the Factions heading and Add Faction button", () => {
    render(<FactionsSection {...defaults} />);
    expect(screen.getByText("Factions")).toBeInTheDocument();
    expect(screen.getByText("Add Faction")).toBeInTheDocument();
  });

  it("calls onChange with a new faction when Add Faction is clicked", () => {
    const onChange = vi.fn();
    render(<FactionsSection {...defaults} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add Faction"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newFactions = onChange.mock.calls[0][0];
    expect(newFactions).toHaveLength(3);
    expect(newFactions[2].name).toBe("");
  });
});
